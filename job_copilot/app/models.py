from sqlalchemy import Column, Integer, String, Text
from app.database import Base


class JobModel(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    link = Column(String, nullable=False)
    score = Column(Integer, default=0)


class ProfileModel(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    resume_text = Column(Text, nullable=False)
    skills = Column(Text, nullable=False)  # store as comma-separated for now