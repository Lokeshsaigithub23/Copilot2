const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

/**
 * Converts a video file to an MP3 audio file using FFmpeg.
 *
 * @param {string} videoPath - Absolute path to the source video file.
 * @param {string} outputDir - Absolute path to the directory for the output audio file.
 * @returns {Promise<{ audioPath: string, audioFileName: string }>}
 */
function convertVideoToAudio(videoPath, outputDir) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(videoPath)) {
      return reject(new Error(`Source video file not found: ${videoPath}`));
    }

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    const baseName = path.basename(videoPath, path.extname(videoPath));
    const audioFileName = `${baseName}_audio_${Date.now()}.mp3`;
    const audioPath = path.join(outputDir, audioFileName);

    console.log(`[video-processor] Starting conversion: ${path.basename(videoPath)} → ${audioFileName}`);

    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(2)
      .audioFrequency(44100)
      .output(audioPath)
      .on('start', (cmd) => {
        console.log(`[video-processor] FFmpeg command: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`[video-processor] Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`[video-processor] Conversion complete: ${audioFileName}`);
        resolve({ audioPath, audioFileName });
      })
      .on('error', (err) => {
        console.error(`[video-processor] FFmpeg error:`, err.message);
        // Clean up partial output file on failure
        try {
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        } catch (_) {}
        reject(new Error(`Video to audio conversion failed: ${err.message}`));
      })
      .run();
  });
}

module.exports = { convertVideoToAudio };
