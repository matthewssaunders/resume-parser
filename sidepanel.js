// --- CONFIGURATION ---
const CLOUDFLARE_WORKER_URL = "https://resume-parser.matthewssaunders.workers.dev/"; 
const SECRET_KEY = "YRESUME-PARSER-V1"; // Must match 'SECRET_KEY' variable in Cloudflare

const uploadInput = document.getElementById('pdf-upload');
const loadingIndicator = document.getElementById('loading-indicator');
const jobsContainer = document.getElementById('jobs-container');
const savedSelect = document.getElementById('saved-resumes');
const saveBtn = document.getElementById('save-local-btn');
const deleteBtn = document.getElementById('delete-btn');

// Configure PDF.js worker source (Relative to extension)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

// --- 1. Initialization ---
document.addEventListener('DOMContentLoaded', loadSavedResumesList);

// --- 2. File Upload & Parsing ---
uploadInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setLoading(true, "Extracting text...");

  try {
    // A. Extract Text Locally
    const text = await extractTextFromPDF(file);
    
    setLoading(true, "Analyzing with AI...");

    // B. Send Text to Cloudflare Worker
    const response = await fetch(CLOUDFLARE_WORKER_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Auth-Key': SECRET_KEY 
      },
      body: JSON.stringify({ text: text })
    });

    if (response.status === 401) throw new Error('Unauthorized: Check SECRET_KEY');
    if (!response.ok) throw new Error('Worker failed');
    
    const parsedData = await response.json();
    
    // C. Render
    renderJobs(parsedData.jobs || []);
    
    const saveName = prompt("Success! Name this resume:", "Resume " + new Date().toLocaleDateString());
    if (saveName) {
      saveResumeToStorage(saveName, parsedData.jobs);
    }

  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  } finally {
    setLoading(false);
    uploadInput.value = ''; 
  }
});

// --- 3. Rendering Logic ---
function renderJobs(jobs) {
  jobsContainer.innerHTML = ''; 
  const jobsToShow = jobs.slice(0, 25);

  if(jobsToShow.length === 0) {
    jobsContainer.innerHTML = '<div class="text-center text-slate-400 text-sm mt-4">No jobs found in AI response.</div>';
    return;
  }

  jobsToShow.forEach((job, index) => {
    const jobCard = document.createElement('div');
    jobCard.className = "bg-white p-3 rounded border border-slate-200 shadow-sm relative group mb-4";
    jobCard.innerHTML = `
      <div class="absolute -left-2 -top-2 bg-blue-100 text-blue-600 text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full border border-blue-200">
        ${index + 1}
      </div>
      <div class="grid gap-3 mt-2">
        <input type="text" placeholder="Company" class="data-field w-full text-sm border-slate-200 rounded p-2 bg-slate-50 font-semibold" data-key="company" value="${job.company || ''}">
        <input type="text" placeholder="Job Title" class="data-field w-full text-sm border-slate-200 rounded p-2" data-key="title" value="${job.title || ''}">
        <input type="text" placeholder="Location" class="data-field w-full text-sm border-slate-200 rounded p-2" data-key="location" value="${job.location || ''}">
        <div class="flex gap-2">
          <input type="text" placeholder="Start Date" class="data-field w-1/2 text-sm border-slate-200 rounded p-2" data-key="startDate" value="${job.startDate || ''}">
          <input type="text" placeholder="End Date" class="data-field w-1/2 text-sm border-slate-200 rounded p-2" data-key="endDate" value="${job.endDate || ''}">
        </div>
        <textarea placeholder="Description" rows="3" class="data-field w-full text-sm border-slate-200 rounded p-2" data-key="description">${job.description || ''}</textarea>
      </div>
    `;
    jobsContainer.appendChild(jobCard);
  });
}

// --- 4. Storage & UI Helpers ---
function setLoading(isLoading, text) {
  if(isLoading) {
    loadingIndicator.textContent = text;
    loadingIndicator.classList.remove('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
  }
}

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + "\n";
  }
  return fullText;
}

// ... existing code for Storage Management (loadSavedResumesList, saveResumeToStorage, event listeners) ...
async function loadSavedResumesList() {
  const data = await chrome.storage.local.get(null);
  savedSelect.innerHTML = '<option value="">Select a resume...</option>';
  Object.keys(data).forEach(key => {
    if (key.startsWith('resume_')) {
      const name = key.replace('resume_', '');
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name;
      savedSelect.appendChild(option);
    }
  });
}

savedSelect.addEventListener('change', async (e) => {
  const key = e.target.value;
  if (!key) return;
  const result = await chrome.storage.local.get(key);
  if (result[key]) renderJobs(result[key]);
});

function saveResumeToStorage(name, jobsData) {
  const key = `resume_${name}`;
  const data = {};
  data[key] = jobsData;
  chrome.storage.local.set(data, () => {
    loadSavedResumesList();
    savedSelect.value = key;
  });
}

saveBtn.addEventListener('click', () => {
  if (!savedSelect.value) {
    alert("Please select or create a resume to save changes to.");
    return;
  }
  const jobs = [];
  const cards = jobsContainer.children;
  for (let card of cards) {
    const inputs = card.querySelectorAll('.data-field');
    const job = {};
    inputs.forEach(input => job[input.dataset.key] = input.value);
    jobs.push(job);
  }
  const currentName = savedSelect.options[savedSelect.selectedIndex].text;
  saveResumeToStorage(currentName, jobs);
  alert("Saved!");
});

deleteBtn.addEventListener('click', () => {
  const key = savedSelect.value;
  if (!key) return;
  if(confirm("Delete this resume?")) {
    chrome.storage.local.remove(key, () => {
      loadSavedResumesList();
      jobsContainer.innerHTML = '';
    });
  }
});
