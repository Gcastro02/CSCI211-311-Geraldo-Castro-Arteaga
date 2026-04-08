const API = "http://127.0.0.1:8000";

async function saveProfile() {
    const resume = document.getElementById("resume").value;

    const res = await fetch(`${API}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Student",
            resume_text: resume,
            skills: ["Python", "C++", "Git", "Linux"]
        })
    });

    alert("Profile saved!");
}

async function generateBullets() {
    const job = document.getElementById("job").value;

    const res = await fetch(`${API}/ai-tailor-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: job })
    });

    const data = await res.json();

    document.getElementById("output").innerText =
        data.tailored_bullets.join("\n");
}

async function generateCoverLetter() {
    const job = document.getElementById("job").value;

    const res = await fetch(`${API}/ai-generate-cover-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            job_description: job,
            company: "Example Company",
            role: "Software Engineering Intern"
        })
    });

    const data = await res.json();

    document.getElementById("output").innerText =
        data.cover_letter;
}