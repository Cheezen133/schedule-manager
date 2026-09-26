import unittest
from datetime import datetime, timezone

from app.config import JWT_EXPIRE_HOURS
from app.schemas.auth import LoginRequest
from app.utils.security import create_access_token, decode_access_token


class AuthPersistenceTests(unittest.TestCase):
    def test_login_request_defaults_to_session_login(self):
        request = LoginRequest(username="tester", password="password1")

        self.assertFalse(request.auto_login)

    def test_session_token_keeps_configured_expiration(self):
        payload = decode_access_token(create_access_token({"sub": "1"}))

        self.assertEqual(payload["token_type"], "access")
        self.assertFalse(payload["auto_login"])
        self.assertIn("exp", payload)
        lifetime = payload["exp"] - payload["iat"]
        self.assertAlmostEqual(lifetime, JWT_EXPIRE_HOURS * 60 * 60, delta=2)

    def test_auto_login_token_has_no_expiration(self):
        payload = decode_access_token(
            create_access_token({"sub": "1"}, persistent=True)
        )

        self.assertEqual(payload["token_type"], "access")
        self.assertTrue(payload["auto_login"])
        self.assertNotIn("exp", payload)
        self.assertLessEqual(
            abs(datetime.now(timezone.utc).timestamp() - payload["iat"]),
            2,
        )


if __name__ == "__main__":
    unittest.main()
