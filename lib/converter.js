
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
  return new Promise(async (resolve, reject) => {
    try {
      const tempDir = path.join(__dirname, '../temp')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      let tmp = path.join(tempDir, Date.now() + '.' + ext)
      let out = tmp + '.' + ext2
      await fs.promises.writeFile(tmp, buffer)
      // stdio 'ignore' : sans ça, stderr (non lu) se remplit et ffmpeg se bloque pour toujours (processus zombie + RAM).
      // -threads 1 + délai max : un seul ffmpeg léger, tué s'il traîne.
      const child = spawn('ffmpeg', [
        '-y',
        '-threads', '1',
        '-i', tmp,
        ...args,
        out
      ], { stdio: 'ignore' })
      const killer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 90000)
      child
        .on('error', (e) => { clearTimeout(killer); fs.promises.unlink(tmp).catch(() => {}); reject(e) })
        .on('close', async (code) => {
          clearTimeout(killer)
          try {
            await fs.promises.unlink(tmp)
            if (code !== 0) { fs.promises.unlink(out).catch(() => {}); return reject(code) }
            const result = await fs.promises.readFile(out)
            fs.promises.unlink(out).catch(() => {})
            resolve(result)
          } catch (e) {
            reject(e)
          }
        })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Convert Audio to Playable WhatsApp Audio
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 */
function toAudio(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-ac', '2',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'mp3'
  ], ext, 'mp3')
}

/**
 * Convert Audio to Playable WhatsApp PTT
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 */
function toPTT(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vbr', 'on',
    '-compression_level', '10'
  ], ext, 'opus')
}

/**
 * Convert Audio to Playable WhatsApp Video
 * @param {Buffer} buffer Video Buffer
 * @param {String} ext File Extension 
 */
function toVideo(buffer, ext) {
  return ffmpeg(buffer, [
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-ab', '128k',
    '-ar', '44100',
    '-crf', '32',
    '-preset', 'slow'
  ], ext, 'mp4')
}

module.exports = {
  toAudio,
  toPTT,
  toVideo,
  ffmpeg,
}