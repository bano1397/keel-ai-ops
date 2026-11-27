import time

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select

from keel.config import settings
from keel.db import User, session


def login(email: str, password: str) -> dict | None:
    with session() as db:
        u = db.scalar(select(User).where(User.email == email.strip().lower()))
        if not u or not bcrypt.checkpw(password.encode(), u.password_hash.encode()):
            return None
        token = jwt.encode(
            {"sub": u.email, "role": u.role, "name": u.name, "exp": int(time.time()) + 12 * 3600},
            settings().jwt_secret,
            algorithm="HS256",
        )
        return {"token": token, "user": {"email": u.email, "role": u.role, "name": u.name}}


def current_user(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else request.query_params.get("token", "")
    try:
        data = jwt.decode(token, settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Not authenticated") from None
    return {"email": data["sub"], "role": data["role"], "name": data.get("name")}


def admin_only(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Admin role required")
    return user
