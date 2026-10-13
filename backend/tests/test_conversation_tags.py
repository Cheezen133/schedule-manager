"""会话标签：个人私有、多标签，只能给自己所在的会话打标签。"""
import asyncio
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401 - register all tables
from app.models.conversation import Conversation, ConversationMember
from app.models.conversation_tag import ConversationTag, ConversationTagLink
from app.models.user import User
from app.routers.chat import (
    ConversationTagsRequest, TagNameRequest,
    create_conversation_tag, delete_conversation_tag, list_conversation_tags,
    rename_conversation_tag, set_conversation_tags,
)


class ConversationTagTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.alice = User(username='alice', nickname='爱丽丝', password_hash='x')
        self.bob = User(username='bob', nickname='小波', password_hash='x')
        self.carol = User(username='carol', nickname='卡罗', password_hash='x')
        self.db.add_all([self.alice, self.bob, self.carol])
        self.db.flush()
        self.private = Conversation(user1_id=self.alice.id, user2_id=self.bob.id, is_accepted=1)
        self.group = Conversation(user1_id=self.alice.id, user2_id=self.bob.id, created_by=self.alice.id, is_group=True, is_accepted=1, group_name='测试群')
        self.outside = Conversation(user1_id=self.bob.id, user2_id=self.carol.id, is_accepted=1)
        self.db.add_all([self.private, self.group, self.outside])
        self.db.flush()
        self.db.add_all([
            ConversationMember(conversation_id=self.group.id, user_id=self.alice.id, role='owner'),
            ConversationMember(conversation_id=self.group.id, user_id=self.bob.id, role='member'),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def create_tag(self, user, name):
        return asyncio.run(create_conversation_tag(TagNameRequest(name=name), self.db, user))['data']

    def set_tags(self, conv, tag_ids, user):
        return asyncio.run(set_conversation_tags(conv.id, ConversationTagsRequest(tag_ids=tag_ids), self.db, user))['data']

    def tags_of(self, user):
        return {item['name']: item['conversation_ids'] for item in asyncio.run(list_conversation_tags(self.db, user))['data']}

    def assert_http_error(self, status_code, func, *args):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(func(*args))
        self.assertEqual(ctx.exception.status_code, status_code)

    def test_tag_private_and_group_conversations(self):
        tag = self.create_tag(self.alice, '患者群')
        self.set_tags(self.private, [tag['id']], self.alice)
        self.set_tags(self.group, [tag['id']], self.alice)
        self.assertEqual(self.tags_of(self.alice), {'患者群': [self.private.id, self.group.id]})

    def test_tags_are_private_to_owner(self):
        tag = self.create_tag(self.alice, '同事')
        self.assertEqual(self.tags_of(self.bob), {})
        self.assert_http_error(404, rename_conversation_tag, tag['id'], TagNameRequest(name='改名'), self.db, self.bob)
        self.assert_http_error(404, delete_conversation_tag, tag['id'], self.db, self.bob)
        self.assert_http_error(404, set_conversation_tags, self.private.id, ConversationTagsRequest(tag_ids=[tag['id']]), self.db, self.bob)

    def test_duplicate_or_blank_name_rejected(self):
        self.create_tag(self.alice, '同事')
        self.assert_http_error(409, create_conversation_tag, TagNameRequest(name=' 同事 '), self.db, self.alice)
        self.assert_http_error(400, create_conversation_tag, TagNameRequest(name='   '), self.db, self.alice)
        self.create_tag(self.bob, '同事')  # 不同用户可以有同名标签
        self.assertEqual(self.db.query(ConversationTag).count(), 2)

    def test_cannot_tag_conversation_without_membership(self):
        tag = self.create_tag(self.alice, '同事')
        self.assert_http_error(403, set_conversation_tags, self.outside.id, ConversationTagsRequest(tag_ids=[tag['id']]), self.db, self.alice)
        self.assertEqual(self.db.query(ConversationTagLink).count(), 0)

    def test_setting_tags_replaces_only_own_selection(self):
        colleague = self.create_tag(self.alice, '同事')
        patient = self.create_tag(self.alice, '患者')
        bobs = self.create_tag(self.bob, '朋友')
        self.set_tags(self.private, [colleague['id'], patient['id']], self.alice)
        self.set_tags(self.private, [bobs['id']], self.bob)
        self.set_tags(self.private, [patient['id']], self.alice)
        self.assertEqual(self.tags_of(self.alice), {'同事': [], '患者': [self.private.id]})
        self.assertEqual(self.tags_of(self.bob), {'朋友': [self.private.id]})
        self.set_tags(self.private, [], self.alice)
        self.assertEqual(self.tags_of(self.alice), {'同事': [], '患者': []})

    def test_rename_and_delete_tag(self):
        colleague = self.create_tag(self.alice, '同事')
        self.create_tag(self.alice, '患者')
        self.set_tags(self.group, [colleague['id']], self.alice)
        asyncio.run(rename_conversation_tag(colleague['id'], TagNameRequest(name='科室同事'), self.db, self.alice))
        self.assert_http_error(409, rename_conversation_tag, colleague['id'], TagNameRequest(name='患者'), self.db, self.alice)
        asyncio.run(delete_conversation_tag(colleague['id'], self.db, self.alice))
        self.assertEqual(self.tags_of(self.alice), {'患者': []})
        self.assertEqual(self.db.query(ConversationTagLink).count(), 0)
        self.assertIsNotNone(self.db.get(Conversation, self.group.id))


if __name__ == '__main__':
    unittest.main()
