from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine, Base
from app.models import JobModel, ProfileModel
from app.schemas import (
    JobCreate,
    JobResponse,
    ProfileCreate,
    TailorRequest,
    TailorResponse,
    CoverLetterRequest,
    CoverLetterResponse,
    AITailorRequest,
    AITailorResponse,
    AICoverLetterRequest,
    AICoverLetterResponse,
)
from app.ai_client import client

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Internship Copilot API")

def generate_cover_letter(name: str, role: str, company: str, skills: list[str]) -> str:
    skills_str = ", ".join(skills[:4]) if skills else "software development"

    letter = f"""
Dear {company} Hiring Team,

I am excited to apply for the {role} position at {company}. As a computer engineering student, I have developed a strong foundation in {skills_str}, along with hands-on experience building technical projects involving backend systems and application development.

Through my projects, I have worked with tools like Python, Git, and Linux to design and implement functional systems. I enjoy solving problems that require both technical depth and creativity, and I am particularly interested in opportunities where I can contribute to real-world engineering challenges.

I am especially interested in {company} because of its focus on innovation and engineering excellence. I would welcome the opportunity to contribute and continue developing my skills in a professional environment.

Thank you for your time and consideration.

Sincerely,  
{name}
"""
    return letter.strip()

def extract_matched_skills(job_description: str, skills: list[str]) -> list[str]:
    job_text = job_description.lower()
    matched = []

    for skill in skills:
        if skill.lower() in job_text:
            matched.append(skill)

    return matched


def generate_tailored_bullets(name: str, matched_skills: list[str], job_description: str) -> list[str]:
    bullets = []

    if matched_skills:
        bullets.append(
            f"Applied {', '.join(matched_skills[:3])} in hands-on technical projects involving software development and system design."
        )

    if "python" in job_description.lower():
        bullets.append(
            "Developed Python-based tools and backend functionality for automation, data handling, and workflow improvement."
        )

    if "linux" in job_description.lower() or "embedded" in job_description.lower():
        bullets.append(
            "Worked in Linux-based development environments and explored low-level system and embedded programming concepts."
        )

    if "git" in job_description.lower():
        bullets.append(
            "Used Git and GitHub for version control, project organization, and collaborative development practices."
        )

    if len(bullets) < 3:
        bullets.append(
            "Built technical projects that required debugging, iterative development, and translating requirements into working software."
        )

    if len(bullets) < 3:
        bullets.append(
            "Strengthened software engineering fundamentals through project-based experience with APIs, databases, and structured application design."
        )

    return bullets[:3]

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

@app.post("/tailor-resume", response_model=TailorResponse)
def tailor_resume(data: TailorRequest, db: Session = Depends(get_db)):
    profile = db.query(ProfileModel).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    skills_list = profile.skills.split(",") if profile.skills else []
    matched_skills = extract_matched_skills(data.job_description, skills_list)
    tailored_bullets = generate_tailored_bullets(
        profile.name,
        matched_skills,
        data.job_description
    )

    return {
        "matched_skills": matched_skills,
        "tailored_bullets": tailored_bullets
    }

@app.post("/generate-cover-letter", response_model=CoverLetterResponse)
def create_cover_letter(data: CoverLetterRequest, db: Session = Depends(get_db)):
    profile = db.query(ProfileModel).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    skills_list = profile.skills.split(",") if profile.skills else []

    letter = generate_cover_letter(
        profile.name,
        data.role,
        data.company,
        skills_list
    )

    return {"cover_letter": letter}

@app.post("/ai-tailor-resume", response_model=AITailorResponse)
def ai_tailor_resume(data: AITailorRequest, db: Session = Depends(get_db)):
    profile = db.query(ProfileModel).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    prompt = f"""
You are helping a computer engineering student tailor their resume.

Student name: {profile.name}
Resume text:
{profile.resume_text}

Skills:
{profile.skills}

Job description:
{data.job_description}

Task:
Write exactly 3 strong, concise, resume bullet points tailored to this job.
Requirements:
- Each bullet should sound realistic for a student
- Use action verbs
- Do not invent companies or experiences
- Focus on transferable technical skills
Return only the 3 bullet points, one per line, with no extra text.
"""

    response = client.responses.create(
        model="gpt-5.4-mini",
        input=prompt,
    )

    text = response.output_text.strip()
    bullets = [line.lstrip("-• ").strip() for line in text.splitlines() if line.strip()]

    return {"tailored_bullets": bullets[:3]}


@app.post("/ai-generate-cover-letter", response_model=AICoverLetterResponse)
def ai_generate_cover_letter(data: AICoverLetterRequest, db: Session = Depends(get_db)):
    profile = db.query(ProfileModel).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    prompt = f"""
You are helping a computer engineering student write a tailored cover letter.

Student name: {profile.name}
Resume text:
{profile.resume_text}

Skills:
{profile.skills}

Company: {data.company}
Role: {data.role}
Job description:
{data.job_description}

Write a professional, student-appropriate cover letter.
Requirements:
- 250 words max
- Sound specific and tailored
- Do not invent experiences
- Highlight relevant technical skills from the resume
- Return only the cover letter text
"""

    response = client.responses.create(
        model="gpt-5.4-mini",
        input=prompt,
    )

    return {"cover_letter": response.output_text.strip()}