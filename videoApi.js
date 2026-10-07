import axios from 'axios';
import { API_BASE } from './api';

/**
 * Upload a video file to /api/video/upload.
 * Starts background audio conversion and immediately returns jobId.
 *
 * @param {File} file
 * @param {string} token
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<{ ok: boolean, jobId: string, message: string, video: { fileName: string, fileSize: number, url: string } }>}
 */
export async function uploadVideoFile(file, token, onProgress) {
  const formData = new FormData();
  formData.append('video', file);

  const response = await axios.post(`${API_BASE}/api/video/upload`, formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    }
  });

  return response.data;
}

/**
 * Poll status of an ongoing video-to-audio conversion job.
 * Uses HTTP polling with ?poll=true.
 *
 * @param {string} jobId
 * @param {string} token
 * @param {Object} [options]
 * @param {(data: any) => void} [options.onProgress]
 * @param {number} [options.intervalMs]
 * @param {number} [options.maxAttempts]
 * @returns {Promise<{ ok: boolean, status: string, jobId: string, audioUrl?: string, audioFileName?: string }>}
 */
export async function pollVideoJobStatus(jobId, token, options = {}) {
  const intervalMs = options.intervalMs || 1000;
  const maxAttempts = options.maxAttempts || 300; // up to 5 minutes for large videos
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await axios.get(`${API_BASE}/api/video/status/${jobId}?poll=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = response.data;
      if (options.onProgress) {
        options.onProgress(data);
      }

      if (data.status === 'completed') {
        return data;
      }

      if (data.status === 'error') {
        throw new Error(data.message || 'Video to audio conversion failed.');
      }
    } catch (err) {
      // If server returned 404 right at start, give it a moment
      if (err.response?.status === 404 && attempts <= 3) {
        // Wait and retry
      } else if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      } else if (err.message && err.message.includes('conversion failed')) {
        throw err;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Conversion is taking longer than expected. Please check your Video Sessions tab in a moment.');
}

/**
 * Fetch all video conversion sessions for the authenticated user.
 *
 * @param {string} token
 * @returns {Promise<{ ok: boolean, sessions: Array }>}
 */
export async function fetchVideoSessions(token) {
  const response = await axios.get(`${API_BASE}/api/video/sessions`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

/**
 * Fetch details of a single video session.
 *
 * @param {string} id
 * @param {string} token
 * @returns {Promise<{ ok: boolean, session: any }>}
 */
export async function fetchVideoSessionDetail(id, token) {
  const response = await axios.get(`${API_BASE}/api/video/session/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

/**
 * Delete a video session and its local audio file.
 *
 * @param {string} id
 * @param {string} token
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function deleteVideoSession(id, token) {
  const response = await axios.delete(`${API_BASE}/api/video/session/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}
