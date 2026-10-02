import asyncio
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401 - register all tables
from app.models.conversation import Conversation, ConversationMember
from app.models.chat_message import ChatMessage
from app.models.notification import Notification
from app.models.user import User
from app.routers.chat import TextMessageRequest, send_text


class ChatMentionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.sender = User(username='sender', nickname='发送者', password_hash='x')
        self.bob = User(username='bob', nickname='小波', password_hash='x')
        self.bobby = User(username='bobby', nickname='大波', password_hash='x')
        self.outsider = User(username='outsider', nickname='群外', password_hash='x')
        self.db.add_all([self.sender, self.bob, self.bobby, self.outsider])
        self.db.flush()
        self.group = Conversation(user1_id=self.sender.id, user2_id=self.bob.id, created_by=self.sender.id, is_group=True, is_accepted=1, group_name='测试群')
        self.db.add(self.group)
        self.db.flush()
        self.db.add_all([ConversationMember(conversation_id=self.group.id, user_id=user.id) for user in [self.sender, self.bob, self.bobby]])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_group_mention_targets_exact_member_and_preserves_multiline_message(self):
        content = '请 @bob 看一下\n第二行复制的内容 @outsider'
        asyncio.run(send_text(self.group.id, TextMessageRequest(content=content), self.db, self.sender))

        message = self.db.query(ChatMessage).one()
        self.assertEqual(message.content, content)
        notifications = self.db.query(Notification).all()
        self.assertEqual(len(notifications), 2)
        by_user = {item.user_id: item for item in notifications}
        self.assertEqual(by_user[self.bob.id].type, 'chat_mention')
        self.assertIn('@了你', by_user[self.bob.id].title)
        self.assertEqual(by_user[self.bobby.id].type, 'chat_message')
        self.assertNotIn(self.outsider.id, by_user)

    def test_similar_username_does_not_mention_other_member(self):
        asyncio.run(send_text(self.group.id, TextMessageRequest(content='发给 @bobby'), self.db, self.sender))
        by_user = {item.user_id: item for item in self.db.query(Notification).all()}
        self.assertEqual(by_user[self.bob.id].type, 'chat_message')
        self.assertEqual(by_user[self.bobby.id].type, 'chat_mention')


if __name__ == '__main__':
    unittest.main()
