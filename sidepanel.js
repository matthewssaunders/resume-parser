// --- CONFIGURATION ---
// 1. Enter your Cloudflare Worker URL (e.g., https://resume-parser.yourname.workers.dev)
const CLOUDFLARE_WORKER_URL = "https://resume-parser.matthewssaunders.workers.dev"; 

// NO HARDCODED KEY HERE ANYMORE!
// We will load it from settings.

const uploadInput = document.getElementById('pdf-upload');
const loadingIndicator = document.getElementById('loading-indicator');
const jobsContainer = document.getElementById('jobs-container');
const savedSelect = document.getElementById('saved-resumes');
const saveBtn = document.getElementById('save-local-btn');
const deleteBtn = document.getElementById('delete-btn');

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
} else {
  console.error("PDF.js not loaded. Did you download pdf.min.js?");
}

// --- 1. Initialization ---
document.addEventListener('DOMContentLoaded', loadSavedResumesList);

// --- 2. File Upload & Parsing ---
uploadInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // 1. GET AUTH KEY SAFELY
  const authKey = await getOrPromptAuthKey();
  if (!authKey) {
    alert("Cannot proceed without an API Key.");
    uploadInput.value = '';
    return;
  }

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
        'X-Auth-Key': authKey // Use the variable, not a hardcoded string
      },
      body: JSON.stringify({ text: text })
    });

    if (response.status === 401) {
      // If 401, the key was wrong. Clear it so user can try again next time.
      await chrome.storage.local.remove('user_api_key');
      throw new Error(`Unauthorized. The Secret Key was incorrect and has been cleared. Please try again.`);
    }
    
    // C. Handle Responses
    if (!response.ok) {
      let errMessage = response.statusText;
      try {
        const errData = await response.json();
        if (errData.error) errMessage = errData.error;
      } catch (e) { }
      
      throw new Error(`Worker Error: ${errMessage}`);
    }
    
    // D. Parse Success Data
    let parsedData;
    try {
      parsedData = await response.json();
    } catch (jsonErr) {
      console.error("Raw response parsing failed", jsonErr);
      throw new Error("Received invalid data from AI. Please try uploading again.");
    }
    
    // E. Render
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

// --- HELPER: Secure Key Management ---
async function getOrPromptAuthKey() {
  // Check storage first
  const result = await chrome.storage.local.get('user_api_key');
  if (result.user_api_key) {
    return result.user_api_key;
  }

  // If missing, prompt the user
  const inputKey = prompt("First Time Setup:\nPlease enter your Cloudflare Secret Key:");
  if (inputKey && inputKey.trim() !== "") {
    // Save it for next time
    await chrome.storage.local.set({ 'user_api_key': inputKey.trim() });
    return inputKey.trim();
  }
  return null;
}

// --- 3. Rendering Logic ---
function renderJobs(jobs) {
  jobsContainer.innerHTML = ''; 
  const jobsToShow = jobs.slice(0, 25);

  if(!jobs || jobsToShow.length === 0) {
    jobsContainer.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:0.875rem;">No jobs found.</div>';
    return;
  }

  jobsToShow.forEach((job, index) => {
    const jobCard = document.createElement('div');
    jobCard.className = "job-card";
    jobCard.innerHTML = `
      <div class="job-badge">${index + 1}</div>
      <div class="grid-gap">
        <input type="text" placeholder="Company" class="data-field" data-key="company" value="${escapeHtml(job.company || '')}">
        <input type="text" placeholder="Job Title" class="data-field" data-key="title" value="${escapeHtml(job.title || '')}">
        <input type="text" placeholder="Location" class="data-field" data-key="location" value="${escapeHtml(job.location || '')}">
        <div class="row">
          <input type="text" placeholder="Start Date" class="data-field half" data-key="startDate" value="${escapeHtml(job.startDate || '')}">
          <input type="text" placeholder="End Date" class="data-field half" data-key="endDate" value="${escapeHtml(job.endDate || '')}">
        </div>
        <textarea placeholder="Description" rows="3" class="data-field" data-key="description">${escapeHtml(job.description || '')}</textarea>
      </div>
    `;
    jobsContainer.appendChild(jobCard);
  });
}

// --- 4. Storage & Helpers ---
function setLoading(isLoading, text) {
  if(isLoading) {
    loadingIndicator.textContent = text;
    loadingIndicator.classList.remove('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function extractTextFromPDF(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error("PDF.js library not loaded");
  
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
  const cards = jobsContainer.querySelectorAll('.job-card');
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
