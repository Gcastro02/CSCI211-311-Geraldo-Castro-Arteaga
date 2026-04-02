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