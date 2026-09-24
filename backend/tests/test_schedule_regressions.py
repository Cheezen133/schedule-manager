import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401 - register all tables
from app.models.schedule import Schedule
from app.models.schedule_management import ScheduleManagementPermission, ScheduleViewer
from app.models.chat_message import ChatMessage
from app.models.conversation import Conversation, ConversationMember
from app.models.shared_file import SharedFile
from app.models.user import User
from app.models.verification import AuditLog
from app.routers.chat import delete_message, search_chat
from app.routers.export import export_ical
from app.services.schedule_management_service import can_view_schedule
from app.services.schedule_service import (
    EDIT_SNAPSHOT_ACTION,
    approve_schedule,
    create_manager_edit_snapshot,
    reject_schedule,
    toggle_complete,
)


class ScheduleRegressionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = User(username="owner", password_hash="x", nickname="拥有者", role="writer")
        self.manager = User(username="manager", password_hash="x", nickname="管理者", role="reader")
        self.viewer = User(username="viewer", password_hash="x", nickname="观看者", role="writer")
        self.db.add_all([self.owner, self.manager, self.viewer])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_schedule(self, **overrides):
        values = {
            "title": "原日程",
            "description": "原描述",
            "start_time": datetime(2026, 9, 11, 1, 0),
            "end_time": datetime(2026, 9, 11, 2, 0),
            "status": "confirmed",
            "requires_owner_review": False,
            "created_by": self.owner.id,
            "created_by_actor": self.owner.id,
            "visibility": "selected",
            "color": "#123456",
        }
        values.update(overrides)
        schedule = Schedule(**values)
        self.db.add(schedule)
        self.db.flush()
        return schedule

    @patch("app.services.notification_service.create_notification")
    def test_reject_manager_edit_restores_fields_and_viewers(self, _notify):
        schedule = self.make_schedule()
        self.db.add(ScheduleViewer(schedule_id=schedule.id, user_id=self.viewer.id))
        self.db.commit()

        create_manager_edit_snapshot(self.db, schedule, self.manager.id)
        schedule.title = "待审核的新标题"
        schedule.description = "待审核的新描述"
        schedule.visibility = "managers"
        schedule.status = "pending"
        schedule.requires_owner_review = True
        self.db.query(ScheduleViewer).filter_by(schedule_id=schedule.id).delete()
        self.db.commit()

        reject_schedule(self.db, schedule, self.owner.id, "不接受修改")

        self.assertEqual(schedule.title, "原日程")
        self.assertEqual(schedule.description, "原描述")
        self.assertEqual(schedule.visibility, "selected")
        self.assertEqual(schedule.status, "confirmed")
        self.assertFalse(schedule.requires_owner_review)
        self.assertEqual(
            [item.user_id for item in self.db.query(ScheduleViewer).filter_by(schedule_id=schedule.id).all()],
            [self.viewer.id],
        )
        self.assertIsNone(self.db.query(AuditLog).filter_by(
            schedule_id=schedule.id, action=EDIT_SNAPSHOT_ACTION
        ).first())
        rejection = self.db.query(AuditLog).filter_by(
            schedule_id=schedule.id, action="edit_rejected"
        ).one()
        self.assertEqual(rejection.performed_by, self.owner.id)

    @patch("app.services.notification_service.create_notification")
    def test_approve_manager_edit_keeps_new_fields(self, _notify):
        schedule = self.make_schedule()
        self.db.commit()
        create_manager_edit_snapshot(self.db, schedule, self.manager.id)
        schedule.title = "批准后的标题"
        schedule.status = "pending"
        schedule.requires_owner_review = True
        self.db.commit()

        approve_schedule(self.db, schedule, self.owner.id, "同意")

        self.assertEqual(schedule.title, "批准后的标题")
        self.assertEqual(schedule.status, "confirmed")
        self.assertFalse(schedule.requires_owner_review)
        self.assertIsNotNone(self.db.query(AuditLog).filter_by(
            schedule_id=schedule.id, action="manager_edit_approved"
        ).first())

    @patch("app.services.notification_service.create_notification")
    def test_reject_new_delegated_schedule_stays_rejected(self, _notify):
        schedule = self.make_schedule(
            status="pending",
            requires_owner_review=True,
            created_by_actor=self.manager.id,
        )
        self.db.commit()

        reject_schedule(self.db, schedule, self.owner.id, "不需要")

        self.assertEqual(schedule.status, "rejected")
        self.assertFalse(schedule.requires_owner_review)

    def test_private_delegate_visibility_expires_with_permission(self):
        schedule = self.make_schedule(
            visibility="private",
            created_by_actor=self.manager.id,
        )
        permission = ScheduleManagementPermission(
            owner_id=self.owner.id,
            requester_id=self.manager.id,
            status="approved",
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        self.db.add(permission)
        self.db.commit()

        self.assertTrue(can_view_schedule(self.db, schedule, self.manager.id))
        permission.status = "rejected"
        self.db.commit()
        self.assertFalse(can_view_schedule(self.db, schedule, self.manager.id))

    def test_completion_audit_uses_actual_actor(self):
        schedule = self.make_schedule(visibility="managers")
        self.db.commit()

        toggle_complete(self.db, schedule, self.manager.id)

        audit = self.db.query(AuditLog).filter_by(
            schedule_id=schedule.id, action="completed"
        ).one()
        self.assertEqual(audit.performed_by, self.manager.id)

    def test_group_member_can_search_existing_group_history(self):
        conversation = Conversation(
            user1_id=self.owner.id,
            user2_id=self.manager.id,
            is_group=True,
            is_accepted=1,
            group_name="测试群",
            created_by=self.owner.id,
        )
        self.db.add(conversation)
        self.db.flush()
        self.db.add_all([
            ConversationMember(conversation_id=conversation.id, user_id=self.owner.id, role="owner"),
            ConversationMember(conversation_id=conversation.id, user_id=self.manager.id, role="member"),
            ChatMessage(
                conversation_id=conversation.id,
                sender_id=self.owner.id,
                content="加入前的历史关键词",
                msg_type="text",
            ),
        ])
        self.db.commit()

        result = asyncio.run(search_chat("历史关键词", self.db, self.manager))

        self.assertEqual(len(result["data"]["messages"]), 1)
        self.assertEqual(result["data"]["messages"][0]["content"], "加入前的历史关键词")
        self.assertEqual(result["data"]["messages"][0]["partner"]["display_name"], "测试群")

    def test_deleting_source_message_keeps_shared_copy(self):
        conversation = Conversation(
            user1_id=self.owner.id,
            user2_id=self.manager.id,
            is_group=False,
            is_accepted=1,
        )
        self.db.add(conversation)
        self.db.flush()
        message = ChatMessage(
            conversation_id=conversation.id,
            sender_id=self.owner.id,
            content="需要保留的文字",
            msg_type="text",
        )
        self.db.add(message)
        self.db.flush()
        shared = SharedFile(
            conversation_id=conversation.id,
            uploader_id=self.owner.id,
            file_url=f"message://{message.id}",
            file_name="需要保留的文字",
            msg_type="text",
            source_msg_id=message.id,
        )
        self.db.add(shared)
        self.db.commit()

        asyncio.run(delete_message(message.id, self.db, self.owner))

        kept = self.db.get(SharedFile, shared.id)
        self.assertIsNotNone(kept)
        self.assertEqual(kept.content, "需要保留的文字")
        self.assertIsNone(kept.source_msg_id)
        self.assertIsNone(self.db.get(ChatMessage, message.id))
        result = asyncio.run(search_chat("需要保留", self.db, self.owner))
        self.assertEqual(result["data"]["files"][0]["content"], "需要保留的文字")
        self.assertEqual(result["data"]["files"][0]["partner"]["id"], self.manager.id)

    def test_ical_export_is_limited_to_selected_owner(self):
        owner_schedule = self.make_schedule(title="拥有者专属导出", visibility="managers")
        manager_schedule = Schedule(
            title="不应混入的管理者日程",
            start_time=datetime(2026, 9, 12, 1, 0),
            end_time=datetime(2026, 9, 12, 2, 0),
            status="confirmed",
            created_by=self.manager.id,
            created_by_actor=self.manager.id,
            visibility="private",
        )
        self.db.add_all([
            manager_schedule,
            ScheduleManagementPermission(
                owner_id=self.owner.id,
                requester_id=self.manager.id,
                status="approved",
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            ),
        ])
        self.db.commit()

        response = asyncio.run(export_ical(None, None, self.owner.id, self.db, self.manager))
        body = response.body.decode("utf-8")

        self.assertIn(owner_schedule.title, body)
        self.assertNotIn(manager_schedule.title, body)

    def test_ical_export_rejects_friend_without_management_permission(self):
        self.make_schedule(visibility="managers")
        self.db.commit()

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(export_ical(None, None, self.owner.id, self.db, self.manager))

        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
