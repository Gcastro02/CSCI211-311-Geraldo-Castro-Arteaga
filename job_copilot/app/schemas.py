from pydantic import BaseModel
from typing import List


class JobCreate(BaseModel):
    title: str
    company: str
    description: str
    link: str


class JobResponse(JobCreate):
    id: int
    score: int

    class Config:
        from_attributes = True


class ProfileCreate(BaseModel):
    name: str
    resume_text: str
    skills: List[str]


class ProfileResponse(BaseModel):
    id: int
    name: str
    resume_text: str
    skills: List[str]


class TailorRequest(BaseModel):
    job_description: str


class TailorResponse(BaseModel):
    matched_skills: List[str]
    tailored_bullets: List[str]


class CoverLetterRequest(BaseModel):
    job_description: str
    company: str
    role: str


class CoverLetterResponse(BaseModel):
    cover_letter: str


class AITailorRequest(BaseModel):
    job_description: str


class AITailorResponse(BaseModel):
    tailored_bullets: List[str]


class AICoverLetterRequest(BaseModel):
    job_description: str
    company: str
    role: str


class AICoverLetterResponse(BaseModel):
    cover_letter: str