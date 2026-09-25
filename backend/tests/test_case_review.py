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

from app.database import Base
import app.models  # noqa: F401 - register all tables
from app.models.case_review import (
    ReviewAnnotation, ReviewCase, ReviewCaseFile, ReviewConclusion, ReviewDailyReport,
    ReviewDailyReportFile, ReviewLog, ReviewProject, ReviewProjectMember,
)
from app.models.user import User
from app.routers import case_review as cr

PDF_BYTES = b"%PDF-1.4\n% fake test pdf\n" + b"0" * 64


def upload(name, data=PDF_BYTES):
    return UploadFile(file=io.BytesIO(data), filename=name)


class CaseReviewTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = User(username="owner", password_hash="x", nickname="上传者", role="writer")
        self.reviewer = User(username="reviewer", password_hash="x", nickname="导师", role="reader")
        self.member = User(username="member", password_hash="x", nickname="同组成员", role="writer")
        self.outsider = User(username="outsider", password_hash="x", nickname="外人", role="writer")
        self.admin = User(username="admin", password_hash="x", nickname="管理员", role="admin")
        self.db.add_all([self.owner, self.reviewer, self.member, self.outsider, self.admin])
        self.db.commit()
        # 上传文件写到临时目录，测完整个删掉，不碰项目里的 uploads
        self.tmp = tempfile.TemporaryDirectory()
        self.upload_patch = patch.object(cr, "UPLOAD_DIR", self.tmp.name)
        self.upload_patch.start()
        self.project_id = cr.create_project(cr.ProjectIn(name="炎症课题"), db=self.db, current_user=self.owner)["data"]["id"]
        for user in (self.reviewer, self.member):
            cr.add_member(self.project_id, cr.MemberIn(user_id=user.id), db=self.db, current_user=self.owner)

    def tearDown(self):
        self.upload_patch.stop()
        self.tmp.cleanup()
        self.db.close()
        self.engine.dispose()

    def assert_status(self, code, func, *args, **kwargs):
        with self.assertRaises(HTTPException) as ctx:
            func(*args, **kwargs)
        self.assertEqual(ctx.exception.status_code, code)

    def make_case(self, code="1", reviewer=None, user=None):
        data = cr.CaseIn(code=code, reviewer_id=(reviewer or self.reviewer).id)
        return cr.create_case(self.project_id, data, db=self.db, current_user=user or self.owner)["data"]["id"]

    def upload_pdf(self, case_id, *files, user=None):
        return asyncio.run(cr.upload_case_files(case_id, files=list(files) or [upload("病历.pdf")], db=self.db, current_user=user or self.owner))

    def stored_files(self):
        return [name for _, _, names in os.walk(self.tmp.name) for name in names]

    def test_outsider_sees_nothing(self):
        case_id = self.make_case()
        self.upload_pdf(case_id)
        file_id = self.db.query(ReviewCaseFile.id).scalar()
        asyncio.run(cr.create_daily_report(self.project_id, report_date=None, content="今日纳入 3 例", files=[upload("a.png", b"img")], db=self.db, current_user=self.owner))
        report_file_id = self.db.query(ReviewDailyReportFile.id).scalar()
        kwargs = {"db": self.db, "current_user": self.outsider}
        self.assert_status(404, cr.get_project, self.project_id, **kwargs)
        self.assert_status(404, cr.list_cases, self.project_id, **kwargs)
        self.assert_status(404, cr.get_case, case_id, **kwargs)
        self.assert_status(404, cr.case_file_content, file_id, **kwargs)
        self.assert_status(404, cr.list_annotations, file_id, **kwargs)
        self.assert_status(404, cr.list_daily_reports, self.project_id, offset=0, limit=30, **kwargs)
        self.assert_status(404, cr.daily_report_file_content, report_file_id, **kwargs)
        self.assert_status(404, cr.export_cases, self.project_id, **kwargs)
        self.assertEqual(cr.list_projects(**kwargs)["data"], [])
        # 管理员不是成员也能看
        self.assertEqual(cr.get_case(case_id, db=self.db, current_user=self.admin)["data"]["code"], "1")

    def test_only_assigned_reviewer_concludes_and_status_follows(self):
        case_id = self.make_case()
        self.assertEqual(cr.summary(db=self.db, current_user=self.reviewer)["data"]["waiting_count"], 1)
        self.assertEqual(cr.get_case(case_id, db=self.db, current_user=self.owner)["data"]["status"], "waiting")
        for user in (self.owner, self.member, self.admin):
            self.assert_status(403, cr.save_conclusion, case_id, cr.ConclusionIn(decision="include"), db=self.db, current_user=user)
        self.assert_status(400, cr.save_conclusion, case_id, cr.ConclusionIn(decision="maybe"), db=self.db, current_user=self.reviewer)

        cr.save_conclusion(case_id, cr.ConclusionIn(decision="pending", comment="缺体温单"), db=self.db, current_user=self.reviewer)
        self.assertEqual(cr.get_case(case_id, db=self.db, current_user=self.owner)["data"]["status"], "pending")
        self.assertEqual(cr.summary(db=self.db, current_user=self.reviewer)["data"]["waiting_count"], 0)

        cr.save_conclusion(case_id, cr.ConclusionIn(decision="include", diagnosis="成人 Still 病"), db=self.db, current_user=self.reviewer)
        data = cr.get_case(case_id, db=self.db, current_user=self.member)["data"]
        self.assertEqual((data["status"], data["conclusion"]["diagnosis"]), ("included", "成人 Still 病"))
        self.assertEqual(self.db.query(ReviewConclusion).count(), 1)
        self.assertEqual(self.db.query(ReviewLog).filter_by(action="save_conclusion").count(), 2)
        rows = cr.list_cases(self.project_id, status="included", db=self.db, current_user=self.owner)["data"]
        self.assertEqual([row["id"] for row in rows], [case_id])

    def test_reviewer_must_be_project_member(self):
        self.assert_status(400, cr.create_case, self.project_id, cr.CaseIn(code="1", reviewer_id=self.outsider.id), db=self.db, current_user=self.owner)
        case_id = self.make_case()
        self.assert_status(400, cr.update_case, case_id, cr.CaseIn(code="1", reviewer_id=self.outsider.id), db=self.db, current_user=self.owner)
        self.assert_status(409, cr.create_case, self.project_id, cr.CaseIn(code="1"), db=self.db, current_user=self.member)
        # 普通成员不能改别人建的病历
        self.assert_status(403, cr.update_case, case_id, cr.CaseIn(code="2"), db=self.db, current_user=self.member)

    def test_upload_rejects_non_pdf_without_leaving_files(self):
        case_id = self.make_case()
        with self.assertRaises(HTTPException) as ctx:
            self.upload_pdf(case_id, upload("假的.pdf", b"not a pdf at all"))
        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException):
            self.upload_pdf(case_id, upload("说明.txt", PDF_BYTES))
        # 一次传两份、第二份不合格时，第一份也不能留下
        with self.assertRaises(HTTPException):
            self.upload_pdf(case_id, upload("好的.pdf"), upload("坏的.pdf", b"broken"))
        self.assertEqual(self.stored_files(), [])
        self.assertEqual(self.db.query(ReviewCaseFile).count(), 0)
        with self.assertRaises(HTTPException):
            self.upload_pdf(self.make_case("9"), upload("病历.pdf"), user=self.outsider)

    def test_annotations_and_case_deletion_clean_up(self):
        case_id = self.make_case()
        self.upload_pdf(case_id, upload("病历一.pdf"), upload("病历二.pdf"))
        file_id = self.db.query(ReviewCaseFile.id).order_by(ReviewCaseFile.id).first()[0]
        self.assertEqual(len(self.stored_files()), 2)
        response = cr.case_file_content(file_id, db=self.db, current_user=self.reviewer)
        self.assertTrue(os.path.exists(response.path))

        point = cr.create_annotation(file_id, cr.AnnotationIn(page=1, kind="point", x=0.5, y=0.2, content="体温记录不足三周"), db=self.db, current_user=self.reviewer)["data"]
        self.assertEqual((point["width"], point["height"]), (0, 0))
        cr.create_annotation(file_id, cr.AnnotationIn(page=2, kind="rect", x=0.1, y=0.1, width=0.3, height=0.2, content="见此段"), db=self.db, current_user=self.member)
        for bad in (dict(page=0, x=0.1, y=0.1), dict(page=1, x=1.2, y=0.1), dict(page=1, kind="rect", x=0.9, y=0.1, width=0.3, height=0.1), dict(page=1, kind="rect", x=0.1, y=0.1)):
            values = {"kind": "point", "content": "x", **bad}
            self.assert_status(400, cr.create_annotation, file_id, cr.AnnotationIn(**values), db=self.db, current_user=self.reviewer)
        self.assert_status(403, cr.update_annotation, point["id"], cr.AnnotationUpdate(content="改"), db=self.db, current_user=self.member)
        self.assert_status(403, cr.delete_annotation, point["id"], db=self.db, current_user=self.owner)
        cr.update_annotation(point["id"], cr.AnnotationUpdate(content="体温记录只有两周"), db=self.db, current_user=self.reviewer)
        notes = cr.list_annotations(file_id, db=self.db, current_user=self.owner)["data"]
        self.assertEqual([(n["page"], n["content"], n["can_edit"]) for n in notes], [(1, "体温记录只有两周", False), (2, "见此段", False)])

        cr.save_conclusion(case_id, cr.ConclusionIn(decision="exclude"), db=self.db, current_user=self.reviewer)
        self.assert_status(403, cr.delete_case, case_id, db=self.db, current_user=self.member)
        cr.delete_case(case_id, db=self.db, current_user=self.owner)
        self.assertEqual(self.stored_files(), [])
        for model in (ReviewCase, ReviewCaseFile, ReviewAnnotation, ReviewConclusion):
            self.assertEqual(self.db.query(model).count(), 0, model.__tablename__)

    def test_removing_member_unassigns_but_keeps_conclusion(self):
        case_id = self.make_case()
        cr.save_conclusion(case_id, cr.ConclusionIn(decision="include"), db=self.db, current_user=self.reviewer)
        self.assert_status(403, cr.remove_member, self.project_id, self.reviewer.id, db=self.db, current_user=self.member)
        self.assert_status(400, cr.remove_member, self.project_id, self.owner.id, db=self.db, current_user=self.owner)
        cr.remove_member(self.project_id, self.reviewer.id, db=self.db, current_user=self.owner)
        data = cr.get_case(case_id, db=self.db, current_user=self.owner)["data"]
        self.assertEqual((data["status"], data["reviewer"]), ("unassigned", None))
        self.assertEqual(len(data["conclusions"]), 1)
        self.assert_status(404, cr.get_case, case_id, db=self.db, current_user=self.reviewer)

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
        first = self.db.query(ReviewCase).filter_by(code="2").one()
        cr.save_conclusion(first.id, cr.ConclusionIn(decision="include", diagnosis="肺结核"), db=self.db, current_user=self.reviewer)
        body = cr.export_cases(self.project_id, db=self.db, current_user=self.member).body.decode("utf-8")
        self.assertTrue(body.startswith("﻿编号,"))
        lines = body.lstrip("﻿").splitlines()
        self.assertEqual([line.split(",")[0] for line in lines[1:]], ["1", "2", "10"])
        self.assertIn("已纳入,纳入,肺结核", lines[2])

    def test_delete_project_removes_everything(self):
        case_id = self.make_case()
        self.upload_pdf(case_id)
        asyncio.run(cr.create_daily_report(self.project_id, report_date=None, content="汇报", files=[upload("a.png", b"img")], db=self.db, current_user=self.member))
        self.assert_status(403, cr.delete_project, self.project_id, db=self.db, current_user=self.member)
        cr.delete_project(self.project_id, db=self.db, current_user=self.owner)
        self.assertEqual(self.stored_files(), [])
        for model in (ReviewProject, ReviewProjectMember, ReviewCase, ReviewCaseFile, ReviewDailyReport, ReviewDailyReportFile):
            self.assertEqual(self.db.query(model).count(), 0, model.__tablename__)
        self.assertEqual(self.db.query(ReviewLog).filter_by(action="delete_project").count(), 1)


if __name__ == "__main__":
    unittest.main()
