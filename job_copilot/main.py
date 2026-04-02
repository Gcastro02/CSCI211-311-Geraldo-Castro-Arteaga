from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine, Base
from app.models import JobModel, ProfileModel
from app.schemas import JobCreate, JobResponse, ProfileCreate


Base.metadata.create_all(bind=engine)

app = FastAPI(title="Internship Copilot API")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def score_match(job_description: str, resume_text: str) -> int:
    job_words = set(job_description.lower().split())
    resume_words = set(resume_text.lower().split())
    return len(job_words.intersection(resume_words))


@app.get("/")
def home():
    return {"message": "Internship Copilot API with SQLite is running"}


@app.post("/profile")
def set_profile(profile: ProfileCreate, db: Session = Depends(get_db)):
    existing_profile = db.query(ProfileModel).first()

    skills_text = ",".join(profile.skills)

    if existing_profile:
        existing_profile.name = profile.name
        existing_profile.resume_text = profile.resume_text
        existing_profile.skills = skills_text
    else:
        new_profile = ProfileModel(
            name=profile.name,
            resume_text=profile.resume_text,
            skills=skills_text
        )
        db.add(new_profile)

    db.commit()

    saved_profile = db.query(ProfileModel).first()

    jobs = db.query(JobModel).all()
    for job in jobs:
        job.score = score_match(job.description, saved_profile.resume_text)

    db.commit()

    return {
        "message": "Profile saved successfully"
    }


@app.get("/profile")
def get_profile(db: Session = Depends(get_db)):
    profile = db.query(ProfileModel).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    return {
        "id": profile.id,
        "name": profile.name,
        "resume_text": profile.resume_text,
        "skills": profile.skills.split(",") if profile.skills else []
    }


@app.post("/jobs", response_model=JobResponse)
def add_job(job: JobCreate, db: Session = Depends(get_db)):
    profile = db.query(ProfileModel).first()
    resume_text = profile.resume_text if profile else ""

    new_job = JobModel(
        title=job.title,
        company=job.company,
        description=job.description,
        link=job.link,
        score=score_match(job.description, resume_text)
    )

    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    return new_job


@app.get("/jobs")
def get_jobs(db: Session = Depends(get_db)):
    jobs = db.query(JobModel).all()
    return jobs


@app.get("/ranked-jobs")
def ranked_jobs(db: Session = Depends(get_db)):
    jobs = db.query(JobModel).order_by(JobModel.score.desc()).all()
    return jobs