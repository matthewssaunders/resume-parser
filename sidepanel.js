// --- CONFIGURATION ---
const CLOUDFLARE_WORKER_URL = "https://resume-parser.matthewssaunders.workers.dev"; 

const uploadInput = document.getElementById('pdf-upload');
const dropZone = document.getElementById('drop-zone');
const loadingIndicator = document.getElementById('loading-indicator');
const jobsContainer = document.getElementById('jobs-container');
const savedSelect = document.getElementById('saved-resumes');
const saveBtn = document.getElementById('save-local-btn');
const deleteBtn = document.getElementById('delete-btn');

// Configure PDF.js
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
}

// --- 1. Initialization ---
document.addEventListener('DOMContentLoaded', loadSavedResumesList);

// --- 2. Drag & Drop Logic ---
// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Highlight drop zone when item is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
  dropZone.classList.add('dragover');
}

function unhighlight(e) {
  dropZone.classList.remove('dragover');
}

// Handle dropped files
dropZone.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFileSelect(files[0]);
}

// Handle click to upload (proxies to hidden input)
dropZone.addEventListener('click', () => {
  uploadInput.click();
});

// Handle file input change
uploadInput.addEventListener('change', (e) => {
  handleFileSelect(e.target.files[0]);
});


// --- 3. Main File Processing Logic ---
async function handleFileSelect(file) {
  if (!file) return;

  // Check file type
  if (file.type !== 'application/pdf') {
    alert("Please upload a PDF file.");
    return;
  }

  const authKey = await getOrPromptAuthKey();
  if (!authKey) {
    alert("Cannot proceed without an API Key.");
    uploadInput.value = '';
    return;
  }

  setLoading(true, "Extracting text...");

  try {
    const text = await extractTextFromPDF(file);
    
    // UPDATED: Privacy Notice in Loading State
    setLoading(true, "Analyzing... (PII is being removed, data not used for training purposes)");

    const response = await fetch(CLOUDFLARE_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Key': authKey },
      body: JSON.stringify({ text: text })
    });

    if (response.status === 401) {
      await chrome.storage.local.remove('user_api_key');
      throw new Error(`Unauthorized. The Secret Key was incorrect and has been cleared. Please try again.`);
    }
    
    if (!response.ok) {
      let errMessage = response.statusText;
      try { const errData = await response.json(); if (errData.error) errMessage = errData.error; } catch (e) {}
      throw new Error(`Worker Error: ${errMessage}`);
    }
    
    const parsedData = await response.json();
    renderJobs(parsedData.jobs || []);
    
    // Success Alert
    setTimeout(() => {
      alert("✅ Resume parsed! Please review all information for accuracy before submitting to job applications.");
      
      const saveName = prompt("Success! Name this resume to save it for later:", "Resume " + new Date().toLocaleDateString());
      if (saveName) {
        saveResumeToStorage(saveName, parsedData.jobs);
      }
    }, 100);

  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  } finally {
    setLoading(false);
    uploadInput.value = ''; 
  }
}

// --- 4. Rendering Logic ---
// Event delegation for copy buttons
jobsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;

  const inputGroup = btn.closest('.input-group');
  const input = inputGroup.querySelector('.data-field');
  
  if (input && input.value) {
    navigator.clipboard.writeText(input.value).then(() => {
      const originalIcon = btn.innerHTML;
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => {
        btn.innerHTML = originalIcon;
      }, 1000);
    });
  }
});

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
    
    const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    const createField = (label, key, value, isTextarea = false, widthClass = '') => {
      const inputHtml = isTextarea 
        ? `<textarea class="data-field" rows="4" data-key="${key}">${escapeHtml(value)}</textarea>`
        : `<input type="text" class="data-field" data-key="${key}" value="${escapeHtml(value)}">`;

      return `
        <div class="${widthClass}">
          <label>${label}</label>
          <div class="input-group">
            <button class="copy-btn" title="Copy to clipboard">${copyIcon}</button>
            ${inputHtml}
          </div>
        </div>
      `;
    };

    jobCard.innerHTML = `
      <div class="job-badge">${index + 1}</div>
      ${createField('Company', 'company', job.company)}
      ${createField('Job Title', 'title', job.title)}
      ${createField('Location', 'location', job.location)}
      <div class="row">
        ${createField('Start Date', 'startDate', job.startDate, false, 'half')}
        ${createField('End Date', 'endDate', job.endDate, false, 'half')}
      </div>
      ${createField('Description', 'description', job.description, true)}
    `;
    
    jobsContainer.appendChild(jobCard);
  });
}


// --- 5. Utilities & Storage ---
function setLoading(isLoading, text) {
  if(isLoading) {
    loadingIndicator.textContent = text;
    loadingIndicator.classList.remove('hidden');
    dropZone.classList.add('opacity-50', 'pointer-events-none');
  } else {
    loadingIndicator.classList.add('hidden');
    dropZone.classList.remove('opacity-50', 'pointer-events-none');
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

async function getOrPromptAuthKey() {
  const result = await chrome.storage.local.get('user_api_key');
  if (result.user_api_key) return result.user_api_key;
  const inputKey = prompt("First Time Setup:\nPlease enter your Cloudflare Secret Key:");
  if (inputKey && inputKey.trim() !== "") {
    await chrome.storage.local.set({ 'user_api_key': inputKey.trim() });
    return inputKey.trim();
  }
  return null;
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
