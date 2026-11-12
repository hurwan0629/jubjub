"""로그인·회원가입의 요청과 응답 모양을 정의해요."""

import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator
from pydantic.alias_generators import to_camel


class AuthSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LoginRequest(AuthSchema):
    login_id: str = Field(min_length=1, max_length=128)
    password: SecretStr = Field(min_length=1, max_length=128)


class RegisterRequest(AuthSchema):
    login_id: str = Field(pattern=r"^[A-Za-z0-9]{4,16}$")
    password: SecretStr = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=9, max_length=30)
    email: EmailStr = Field(max_length=254)

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: SecretStr) -> SecretStr:
        password = value.get_secret_value()
        if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
            raise ValueError("비밀번호에 영문과 숫자를 넣어 주세요")
        return value

    @field_validator("name")
    @classmethod
    def nonempty_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("이름을 입력해 주세요")
        return value.strip()

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        value = value.replace("-", "").replace(" ", "")
        if not re.fullmatch(r"[0-9]{9,15}", value):
            raise ValueError("전화번호를 확인해 주세요")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class LoginResponse(AuthSchema):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    is_first_login: bool


class ProfileResponse(AuthSchema):
    name: str
    email: str


class RegisterResponse(ProfileResponse):
    id: str
