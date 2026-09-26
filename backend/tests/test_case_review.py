import asyncio
import io
import os
import tempfile
import unittest
from datetime import date
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.datastructures import Headers

from app.database import Base
import app.models  # noqa: F401 - register all tables
from app.models.case_review import (
    ReviewAnnotation, ReviewCase, ReviewCaseFile, ReviewConclusion, ReviewDailyReport,
    ReviewDailyReportFile, ReviewLog, ReviewProject, ReviewProjectMember,
)
from app.models.user import User
from app.routers import case_review as cr

PDF_BYTES = b"%PDF-1.4\n% fake test pdf\n" + b"0" * 64


def upload(name, data=PDF_BYTES, content_type=None):
    headers = Headers({"content-type": content_type}) if content_type else None
    return UploadFile(file=io.BytesIO(data), filename=name, headers=headers)


class CaseReviewTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = User(username="owner", password_hash="x", nickname="创建者", role="writer")
        self.reviewer = User(username="reviewer", password_hash="x", nickname="导师", role="reader")
        self.member = User(username="member", password_hash="x", nickname="录入员", role="writer")
        self.outsider = User(username="outsider", password_hash="x", nickname="外人", role="writer")
        self.admin = User(username="admin", password_hash="x", nickname="管理员", role="admin")
        self.db.add_all([self.owner, self.reviewer, self.member, self.outsider, self.admin])
        self.db.commit()
        # 上传文件写到临时目录，测完整个删掉，不碰项目里的 uploads
        self.tmp = tempfile.TemporaryDirectory()
        self.upload_patch = patch.object(cr, "UPLOAD_DIR", self.tmp.name)
        self.upload_patch.start()
        self.project_id = cr.create_project(cr.ProjectIn(name="炎症课题"), db=self.db, current_user=self.owner)["data"]["id"]
        self.add(self.reviewer, ["reviewer"])
        self.add(self.member)  # 不指定身份时默认录入员

    def tearDown(self):
        self.upload_patch.stop()
        self.tmp.cleanup()
        self.db.close()
        self.engine.dispose()

    def add(self, user, roles=None):
        cr.add_member(self.project_id, cr.MemberIn(user_id=user.id, roles=roles), db=self.db, current_user=self.owner)

    def set_roles(self, user, roles, permissions=None, by=None):
        cr.update_member(self.project_id, user.id, cr.MemberUpdate(roles=roles, permissions=permissions), db=self.db, current_user=by or self.owner)

    def assert_status(self, code, func, *args, **kwargs):
        with self.assertRaises(HTTPException) as ctx:
            func(*args, **kwargs)
        self.assertEqual(ctx.exception.status_code, code)

    def make_case(self, code="1", reviewer="default", user=None):
        reviewer_id = self.reviewer.id if reviewer == "default" else (reviewer.id if reviewer else None)
        return cr.create_case(self.project_id, cr.CaseIn(code=code, reviewer_id=reviewer_id), db=self.db, current_user=user or self.owner)["data"]["id"]

    def upload_pdf(self, case_id, *files, user=None):
        return asyncio.run(cr.upload_case_files(case_id, files=list(files) or [upload("病历.pdf")], db=self.db, current_user=user or self.owner))

    def first_file_id(self):
        return self.db.query(ReviewCaseFile.id).order_by(ReviewCaseFile.id).first()[0]

    def voice_note(self, file_id, user, audio=None, content=None, duration=12):
        audio = audio or upload("录音.m4a", b"fake audio bytes", "audio/mp4")
        return asyncio.run(cr.create_voice_annotation(file_id, page=1, kind="point", x=0.3, y=0.4, width=0, height=0, content=content,
                                                      duration=duration, audio=audio, db=self.db, current_user=user))["data"]

    def stored_files(self):
        return [name for _, _, names in os.walk(self.tmp.name) for name in names]

    def test_outsider_sees_nothing(self):
        case_id = self.make_case()
        self.upload_pdf(case_id)
        file_id = self.first_file_id()
        note_id = self.voice_note(file_id, self.reviewer)["id"]
        asyncio.run(cr.create_daily_report(self.project_id, report_date=None, content="今日纳入 3 例", files=[upload("a.png", b"img")], db=self.db, current_user=self.owner))
        report_file_id = self.db.query(ReviewDailyReportFile.id).scalar()
        kwargs = {"db": self.db, "current_user": self.outsider}
        self.assert_status(404, cr.get_project, self.project_id, **kwargs)
        self.assert_status(404, cr.list_cases, self.project_id, **kwargs)
        self.assert_status(404, cr.get_case, case_id, **kwargs)
        self.assert_status(404, cr.case_file_content, file_id, **kwargs)
        self.assert_status(404, cr.list_annotations, file_id, **kwargs)
        self.assert_status(404, cr.annotation_audio, note_id, **kwargs)
        self.assert_status(404, cr.list_daily_reports, self.project_id, offset=0, limit=30, **kwargs)
        self.assert_status(404, cr.daily_report_file_content, report_file_id, **kwargs)
        self.assert_status(404, cr.export_cases, self.project_id, **kwargs)
        self.assertEqual(cr.list_projects(**kwargs)["data"], [])
        self.assertEqual(cr.summary(**kwargs)["data"], {"waiting_count": 0})
        # 系统管理员不是成员也能看，也拥有全部权限
        self.assertEqual(cr.get_case(case_id, db=self.db, current_user=self.admin)["data"]["can_conclude"], True)

    def test_role_defaults_and_permission_checks(self):
        case_id = self.make_case()
        self.upload_pdf(case_id)
        file_id = self.first_file_id()
        note = cr.AnnotationIn(page=1, x=0.1, y=0.1, content="意见")
        # 录入员：能建病历、上传、批注、写汇报；不能下结论、导出、管理成员
        cr.create_case(self.project_id, cr.CaseIn(code="2"), db=self.db, current_user=self.member)
        cr.create_annotation(file_id, note, db=self.db, current_user=self.member)
        self.assert_status(403, cr.save_conclusion, case_id, cr.ConclusionIn(decision="include"), db=self.db, current_user=self.member)
        self.assert_status(403, cr.export_cases, self.project_id, db=self.db, current_user=self.member)
        self.assert_status(403, cr.add_member, self.project_id, cr.MemberIn(user_id=self.outsider.id), db=self.db, current_user=self.member)
        # 审阅人：能批注、下结论、导出；不能建病历、上传
        self.assert_status(403, cr.create_case, self.project_id, cr.CaseIn(code="3"), db=self.db, current_user=self.reviewer)
        with self.assertRaises(HTTPException):
            self.upload_pdf(case_id, user=self.reviewer)
        cr.export_cases(self.project_id, db=self.db, current_user=self.reviewer)
        # 只读：只能看
        self.add(self.outsider, ["viewer"])
        self.assertEqual(cr.get_case(case_id, db=self.db, current_user=self.outsider)["data"]["my_permissions"], [])
        self.assert_status(403, cr.create_annotation, file_id, note, db=self.db, current_user=self.outsider)
        with self.assertRaises(HTTPException):
            asyncio.run(cr.create_daily_report(self.project_id, report_date=None, content="x", files=None, db=self.db, current_user=self.outsider))
        # 项目详情里的成员身份与权限
        members = {m["username"]: m for m in cr.get_project(self.project_id, db=self.db, current_user=self.owner)["data"]["members"]}
        self.assertEqual(members["owner"]["is_creator"], True)
        self.assertEqual(members["owner"]["permissions"], list(cr.PERMISSIONS))
        self.assertEqual((members["member"]["roles"], members["member"]["permissions"]), (["recorder"], ["upload", "annotate", "report"]))
        self.assertEqual(members["outsider"]["role_labels"], ["只读"])

    def test_multiple_roles_custom_permissions_and_manager(self):
        # 多重身份：权限取并集
        self.set_roles(self.member, ["recorder", "reviewer"])
        case_id = self.make_case(reviewer=self.member)
        cr.save_conclusion(case_id, cr.ConclusionIn(decision="pending"), db=self.db, current_user=self.member)
        # 逐项调整：去掉下结论后，其负责的病历改回未指派
        self.set_roles(self.member, ["recorder", "reviewer"], permissions=["upload", "annotate"])
        self.assert_status(403, cr.save_conclusion, case_id, cr.ConclusionIn(decision="include"), db=self.db, current_user=self.member)
        self.assertIsNone(self.db.get(ReviewCase, case_id).reviewer_id)
        self.assert_status(400, cr.update_case, case_id, cr.CaseIn(code="1", reviewer_id=self.member.id), db=self.db, current_user=self.owner)
        # 恢复为身份默认
        self.set_roles(self.member, ["reviewer"], permissions=None)
        cr.update_case(case_id, cr.CaseIn(code="1", reviewer_id=self.member.id), db=self.db, current_user=self.owner)
        # 管理员身份：能管理成员、改删别人的批注和汇报，但不能删项目；创建者不能被改
        self.upload_pdf(case_id)
        note_id = cr.create_annotation(self.first_file_id(), cr.AnnotationIn(page=1, x=0.1, y=0.1, content="导师的意见"), db=self.db, current_user=self.reviewer)["data"]["id"]
        self.add(self.outsider, ["manager"])
        cr.update_annotation(note_id, cr.AnnotationUpdate(content="管理员改过"), db=self.db, current_user=self.outsider)
        self.set_roles(self.reviewer, ["reviewer", "recorder"], by=self.outsider)
        self.assert_status(400, cr.update_member, self.project_id, self.owner.id, cr.MemberUpdate(roles=["viewer"]), db=self.db, current_user=self.outsider)
        self.assert_status(403, cr.delete_project, self.project_id, db=self.db, current_user=self.outsider)
        self.assert_status(400, cr.update_member, self.project_id, self.reviewer.id, cr.MemberUpdate(roles=[]), db=self.db, current_user=self.owner)
        self.assert_status(400, cr.update_member, self.project_id, self.reviewer.id, cr.MemberUpdate(roles=["boss"]), db=self.db, current_user=self.owner)
        cr.delete_annotation(note_id, db=self.db, current_user=self.outsider)

    def test_conclusion_latest_wins_and_waiting_count(self):
        case_id = self.make_case()
        self.assertEqual(cr.summary(db=self.db, current_user=self.reviewer)["data"], {"waiting_count": 1})
        self.assert_status(400, cr.save_conclusion, case_id, cr.ConclusionIn(decision="maybe"), db=self.db, current_user=self.reviewer)
        cr.save_conclusion(case_id, cr.ConclusionIn(decision="pending", comment="缺体温单"), db=self.db, current_user=self.reviewer)
        self.assertEqual(cr.get_case(case_id, db=self.db, current_user=self.owner)["data"]["status"], "pending")
        self.assertEqual(cr.summary(db=self.db, current_user=self.reviewer)["data"]["waiting_count"], 0)
        # 创建者拥有全部权限，可以直接下结论；病历状态取最新一份，每个人的结论都保留
        cr.save_conclusion(case_id, cr.ConclusionIn(decision="include", diagnosis="成人 Still 病"), db=self.db, current_user=self.owner)
        data = cr.get_case(case_id, db=self.db, current_user=self.member)["data"]
        self.assertEqual((data["status"], data["conclusion"]["reviewer"]["nickname"]), ("included", "创建者"))
        self.assertEqual([c["reviewer"]["nickname"] for c in data["conclusions"]], ["创建者", "导师"])
        # 导师再次提交（内容不变）也会成为最新一份
        cr.save_conclusion(case_id, cr.ConclusionIn(decision="pending", comment="缺体温单"), db=self.db, current_user=self.reviewer)
        self.assertEqual(cr.get_case(case_id, db=self.db, current_user=self.owner)["data"]["status"], "pending")
        self.assertEqual(self.db.query(ReviewConclusion).count(), 2)
        self.assertEqual(self.db.query(ReviewLog).filter_by(action="save_conclusion").count(), 3)
        rows = cr.list_cases(self.project_id, status="pending", db=self.db, current_user=self.owner)["data"]
        self.assertEqual([row["id"] for row in rows], [case_id])

    def test_reviewer_must_be_member_with_conclude(self):
        self.assert_status(400, cr.create_case, self.project_id, cr.CaseIn(code="1", reviewer_id=self.outsider.id), db=self.db, current_user=self.owner)
        self.assert_status(400, cr.create_case, self.project_id, cr.CaseIn(code="1", reviewer_id=self.member.id), db=self.db, current_user=self.owner)
        case_id = self.make_case()
        self.assert_status(409, cr.create_case, self.project_id, cr.CaseIn(code="1"), db=self.db, current_user=self.member)
        # 录入员不能改别人建的病历，自己建的可以
        self.assert_status(403, cr.update_case, case_id, cr.CaseIn(code="2"), db=self.db, current_user=self.member)
        own_id = self.make_case("5", reviewer=None, user=self.member)
        cr.update_case(own_id, cr.CaseIn(code="6"), db=self.db, current_user=self.member)

    def test_upload_rejects_non_pdf_without_leaving_files(self):
        case_id = self.make_case()
        with self.assertRaises(HTTPException) as ctx:
            self.upload_pdf(case_id, upload("假的.pdf", b"not a pdf at all"))
        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException):
            self.upload_pdf(case_id, upload("说明.txt", PDF_BYTES))
        with self.assertRaises(HTTPException):
            self.upload_pdf(case_id, upload("好的.pdf"), upload("坏的.pdf", b"broken"))
        self.assertEqual(self.stored_files(), [])
        self.assertEqual(self.db.query(ReviewCaseFile).count(), 0)

    def test_annotations_and_case_deletion_clean_up(self):
        case_id = self.make_case()
        self.upload_pdf(case_id, upload("病历一.pdf"), upload("病历二.pdf"))
        file_id = self.first_file_id()
        response = cr.case_file_content(file_id, db=self.db, current_user=self.reviewer)
        self.assertTrue(os.path.exists(response.path))
        point = cr.create_annotation(file_id, cr.AnnotationIn(page=1, kind="point", x=0.5, y=0.2, content="体温记录不足三周"), db=self.db, current_user=self.reviewer)["data"]
        self.assertEqual((point["width"], point["height"], point["has_audio"]), (0, 0, False))
        cr.create_annotation(file_id, cr.AnnotationIn(page=2, kind="rect", x=0.1, y=0.1, width=0.3, height=0.2, content="见此段"), db=self.db, current_user=self.member)
        for bad in (dict(page=0, x=0.1, y=0.1), dict(page=1, x=1.2, y=0.1), dict(page=1, kind="rect", x=0.9, y=0.1, width=0.3, height=0.1), dict(page=1, kind="rect", x=0.1, y=0.1)):
            self.assert_status(400, cr.create_annotation, file_id, cr.AnnotationIn(**{"kind": "point", "content": "x", **bad}), db=self.db, current_user=self.reviewer)
        self.assert_status(403, cr.update_annotation, point["id"], cr.AnnotationUpdate(content="改"), db=self.db, current_user=self.member)
        cr.update_annotation(point["id"], cr.AnnotationUpdate(content="体温记录只有两周"), db=self.db, current_user=self.reviewer)
        notes = cr.list_annotations(file_id, db=self.db, current_user=self.member)["data"]
        self.assertEqual([(n["page"], n["content"], n["can_edit"]) for n in notes], [(1, "体温记录只有两周", False), (2, "见此段", True)])
        self.voice_note(file_id, self.reviewer)
        cr.save_conclusion(case_id, cr.ConclusionIn(decision="exclude"), db=self.db, current_user=self.reviewer)
        self.assert_status(403, cr.delete_case, case_id, db=self.db, current_user=self.member)
        cr.delete_case(case_id, db=self.db, current_user=self.owner)
        self.assertEqual(self.stored_files(), [])
        for model in (ReviewCase, ReviewCaseFile, ReviewAnnotation, ReviewConclusion):
            self.assertEqual(self.db.query(model).count(), 0, model.__tablename__)

    def test_voice_annotations(self):
        case_id = self.make_case()
        self.upload_pdf(case_id)
        file_id = self.first_file_id()
        note = self.voice_note(file_id, self.reviewer)
        self.assertEqual((note["has_audio"], note["audio_duration"], note["content"]), (True, 12, ""))
        response = cr.annotation_audio(note["id"], db=self.db, current_user=self.member)
        self.assertTrue(response.path.endswith(".m4a"))
        self.assertEqual(response.media_type, "audio/mp4")
        # 语音加文字也可以；按内容类型补扩展名（浏览器录音文件名常没有扩展名）
        with_text = self.voice_note(file_id, self.reviewer, audio=upload("blob", b"webm bytes", "audio/webm;codecs=opus"), content="补充说明")
        self.assertTrue(cr.annotation_audio(with_text["id"], db=self.db, current_user=self.owner).path.endswith(".webm"))
        # 不是音频的拒收，只读成员不能录
        with self.assertRaises(HTTPException):
            self.voice_note(file_id, self.reviewer, audio=upload("说明.txt", b"text", "text/plain"))
        self.add(self.outsider, ["viewer"])
        with self.assertRaises(HTTPException):
            self.voice_note(file_id, self.outsider)
        # 语音批注的文字可以改成空；删批注连同语音文件一起删；删 PDF 时其上的语音也删
        cr.update_annotation(with_text["id"], cr.AnnotationUpdate(content=""), db=self.db, current_user=self.reviewer)
        self.assertEqual(len([n for n in self.stored_files() if not n.endswith(".pdf")]), 2)
        cr.delete_annotation(note["id"], db=self.db, current_user=self.reviewer)
        self.assertEqual(len([n for n in self.stored_files() if not n.endswith(".pdf")]), 1)
        cr.delete_case_file(file_id, db=self.db, current_user=self.owner)
        self.assertEqual(self.stored_files(), [])

    def test_removing_member_unassigns_but_keeps_conclusion(self):
        case_id = self.make_case()
        cr.save_conclusion(case_id, cr.ConclusionIn(decision="include"), db=self.db, current_user=self.reviewer)
        self.assert_status(403, cr.remove_member, self.project_id, self.reviewer.id, db=self.db, current_user=self.member)
        self.assert_status(400, cr.remove_member, self.project_id, self.owner.id, db=self.db, current_user=self.owner)
        cr.remove_member(self.project_id, self.reviewer.id, db=self.db, current_user=self.owner)
        data = cr.get_case(case_id, db=self.db, current_user=self.owner)["data"]
        self.assertEqual((data["status"], data["reviewer"]), ("included", None))
        self.assertEqual(len(data["conclusions"]), 1)
        self.assert_status(404, cr.get_case, case_id, db=self.db, current_user=self.reviewer)

    def test_demo_project_visible_to_all_but_read_only(self):
        case_id = self.make_case()
        self.upload_pdf(case_id, user=self.member)
        file_id = self.first_file_id()
        note_id = cr.create_annotation(file_id, cr.AnnotationIn(page=1, x=0.2, y=0.2, content="录入员的标记"), db=self.db, current_user=self.member)["data"]["id"]
        # 只有创建者或系统管理员能设为演示项目，有管理权限的成员也不行；不传 is_public 时照常改名
        self.set_roles(self.reviewer, ["manager"])
        self.assert_status(403, cr.update_project, self.project_id, cr.ProjectIn(name="炎症课题", is_public=True), db=self.db, current_user=self.reviewer)
        cr.update_project(self.project_id, cr.ProjectIn(name="炎症课题", is_public=True), db=self.db, current_user=self.owner)
        cr.update_project(self.project_id, cr.ProjectIn(name="炎症课题（演示）"), db=self.db, current_user=self.reviewer)
        self.assertTrue(self.db.get(ReviewProject, self.project_id).is_public)

        # 非成员能看：项目列表、项目、病历、PDF、批注、汇报
        kwargs = {"db": self.db, "current_user": self.outsider}
        self.assertEqual([(p["id"], p["is_public"], p["is_member"]) for p in cr.list_projects(**kwargs)["data"]], [(self.project_id, True, False)])
        project = cr.get_project(self.project_id, **kwargs)["data"]
        self.assertEqual((project["is_member"], project["my_permissions"], project["can_set_public"]), (False, [], False))
        self.assertEqual(len(cr.list_cases(self.project_id, **kwargs)["data"]), 1)
        self.assertFalse(cr.get_case(case_id, **kwargs)["data"]["can_annotate"])
        cr.case_file_content(file_id, **kwargs)
        self.assertFalse(cr.list_annotations(file_id, **kwargs)["data"][0]["can_edit"])
        cr.list_daily_reports(self.project_id, offset=0, limit=30, **kwargs)
        # 但什么都不能改
        self.assert_status(403, cr.create_case, self.project_id, cr.CaseIn(code="2"), **kwargs)
        self.assert_status(403, self.upload_pdf, case_id, user=self.outsider)
        self.assert_status(403, cr.create_annotation, file_id, cr.AnnotationIn(page=1, x=0.5, y=0.5, content="外人"), **kwargs)
        self.assert_status(403, cr.save_conclusion, case_id, cr.ConclusionIn(decision="include"), **kwargs)
        self.assert_status(403, cr.export_cases, self.project_id, **kwargs)
        self.assert_status(403, cr.update_project, self.project_id, cr.ProjectIn(name="外人改名"), **kwargs)

        # 被移出的成员也只能看：自己原来的批注和上传的文件不能再改、删
        cr.remove_member(self.project_id, self.member.id, db=self.db, current_user=self.owner)
        mine = {"db": self.db, "current_user": self.member}
        self.assertFalse(cr.list_annotations(file_id, **mine)["data"][0]["can_edit"])
        self.assert_status(403, cr.update_annotation, note_id, cr.AnnotationUpdate(content="改"), **mine)
        self.assert_status(403, cr.delete_case_file, file_id, **mine)

        # 取消演示后，非成员又看不到了
        cr.update_project(self.project_id, cr.ProjectIn(name="炎症课题", is_public=False), db=self.db, current_user=self.owner)
        self.assert_status(404, cr.get_project, self.project_id, **kwargs)
        self.assertEqual(cr.list_projects(**kwargs)["data"], [])

    def test_daily_reports(self):
        with self.assertRaises(HTTPException):
            asyncio.run(cr.create_daily_report(self.project_id, report_date=None, content="  ", files=None, db=self.db, current_user=self.owner))
        asyncio.run(cr.create_daily_report(self.project_id, report_date="2026-09-24", content="昨天纳入 2 例", files=None, db=self.db, current_user=self.member))
        asyncio.run(cr.create_daily_report(self.project_id, report_date="2026-09-25", content="今日纳入 3 例", files=[upload("截图.png", b"img"), upload("名单.xlsx", b"xls")], db=self.db, current_user=self.owner))
        items = cr.list_daily_reports(self.project_id, offset=0, limit=30, db=self.db, current_user=self.reviewer)["data"]["items"]
        self.assertEqual([item["report_date"] for item in items], ["2026-09-25", "2026-09-24"])
        self.assertEqual([f["name"] for f in items[0]["files"]], ["截图.png", "名单.xlsx"])
        self.assertEqual(items[0]["can_edit"], False)
        report_id = items[0]["id"]
        self.assert_status(403, cr.update_daily_report, report_id, cr.DailyReportUpdate(report_date=date(2026, 9, 25), content="改"), db=self.db, current_user=self.member)
        cr.update_daily_report(report_id, cr.DailyReportUpdate(report_date=date(2026, 9, 25), content="今日纳入 4 例"), db=self.db, current_user=self.owner)
        file_id = items[0]["files"][0]["id"]
        self.assert_status(403, cr.delete_daily_report_file, file_id, db=self.db, current_user=self.reviewer)
        cr.delete_daily_report_file(file_id, db=self.db, current_user=self.owner)
        self.assertEqual(len(self.stored_files()), 1)
        cr.delete_daily_report(report_id, db=self.db, current_user=self.owner)
        self.assertEqual(self.stored_files(), [])
        self.assertEqual(self.db.query(ReviewDailyReport).count(), 1)

    def test_export_csv(self):
        for code in ("10", "2", "1"):
            self.make_case(code)
        case = self.db.query(ReviewCase).filter_by(code="2").one()
        cr.save_conclusion(case.id, cr.ConclusionIn(decision="include", diagnosis="肺结核"), db=self.db, current_user=self.reviewer)
        body = cr.export_cases(self.project_id, db=self.db, current_user=self.owner).body.decode("utf-8")
        self.assertTrue(body.startswith("﻿编号,"))
        lines = body.lstrip("﻿").splitlines()
        self.assertIn("结论人", lines[0])
        self.assertEqual([line.split(",")[0] for line in lines[1:]], ["1", "2", "10"])
        self.assertIn("已纳入,纳入,肺结核,,导师", lines[2])

    def test_delete_project_removes_everything(self):
        case_id = self.make_case()
        self.upload_pdf(case_id)
        self.voice_note(self.first_file_id(), self.reviewer)
        asyncio.run(cr.create_daily_report(self.project_id, report_date=None, content="汇报", files=[upload("a.png", b"img")], db=self.db, current_user=self.member))
        self.assert_status(403, cr.delete_project, self.project_id, db=self.db, current_user=self.member)
        cr.delete_project(self.project_id, db=self.db, current_user=self.owner)
        self.assertEqual(self.stored_files(), [])
        for model in (ReviewProject, ReviewProjectMember, ReviewCase, ReviewCaseFile, ReviewAnnotation, ReviewDailyReport, ReviewDailyReportFile):
            self.assertEqual(self.db.query(model).count(), 0, model.__tablename__)
        self.assertEqual(self.db.query(ReviewLog).filter_by(action="delete_project").count(), 1)


if __name__ == "__main__":
    unittest.main()
