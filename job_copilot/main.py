from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Internship Copilot API")

# In-memory storage for now
jobs = []
profile = {
    "name": "",
    "resume_text": "",
    "skills": []
}


class Job(BaseModel):
    title: str
    company: str
    description: str
    link: str


class Profile(BaseModel):
    name: str
    resume_text: str
    skills: List[str]


class ScoreRequest(BaseModel):
    job_description: str
    resume_text: str


def score_match(job_description: str, resume_text: str) -> int:
    job_words = set(job_description.lower().split())
    resume_words = set(resume_text.lower().split())
    return len(job_words.intersection(resume_words))


@app.get("/")
def home():
    return {"message": "Internship Copilot API is running"}


@app.get("/jobs")
def get_jobs():
    return {"jobs": jobs}


@app.post("/jobs")
def add_job(job: Job):
    job_data = job.dict()
    job_data["score"] = score_match(job.description, profile["resume_text"])
    jobs.append(job_data)
    return {"message": "Job added successfully", "job": job_data}


@app.get("/profile")
def get_profile():
    return profile


@app.post("/profile")
def set_profile(new_profile: Profile):
    global profile
    profile = new_profile.dict()

    # Re-score existing jobs whenever resume/profile changes
    for job in jobs:
        job["score"] = score_match(job["description"], profile["resume_text"])

    return {"message": "Profile updated successfully", "profile": profile}


@app.post("/score-job")
def score_job(data: ScoreRequest):
    score = score_match(data.job_description, data.resume_text)
    return {"score": score}


@app.get("/ranked-jobs")
def ranked_jobs():
    ranked = sorted(jobs, key=lambda job: job["score"], reverse=True)
    return {"ranked_jobs": ranked}