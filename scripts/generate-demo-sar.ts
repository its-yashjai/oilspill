import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

// Generate a synthetic SAR-like image
function generateSARImage(width: number, height: number, anomalyStrength: number = 0.3): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Dark ocean background
  const oceanColor = "#0a0f1a";
  ctx.fillStyle = oceanColor;
  ctx.fillRect(0, 0, width, height);

  // Add radar-like speckle noise
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Add speckle noise
    const noise = (Math.random() - 0.5) * 40;
    const baseValue = 20 + Math.random() * 30;
    const value = Math.max(0, Math.min(255, baseValue + noise));
    
    data[i] = value;     // R
    data[i + 1] = value; // G
    data[i + 2] = value; // B
    data[i + 3] = 255;   // A
  }
  ctx.putImageData(imageData, 0, 0);

  // Add some texture with noise lines (azimuth/range directions)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + (Math.random() - 0.5) * 10, height);
    ctx.stroke();
  }

  for (let i = 0; i < height; i += 5) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i + (Math.random() - 0.5) * 5);
    ctx.stroke();
  }

  // Add anomaly if specified
  if (anomalyStrength > 0) {
    const centerX = width * 0.5;
    const centerY = height * 0.4;
    const radiusX = width * 0.15;
    const radiusY = height * 0.12;

    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, Math.max(radiusX, radiusY)
    );
    gradient.addColorStop(0, `rgba(0, 180, 212, ${anomalyStrength * 0.6})`);
    gradient.addColorStop(0.5, `rgba(0, 120, 180, ${anomalyStrength * 0.3})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Add dark elongated anomaly (wind-aligned)
    const anomalyGradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, Math.max(radiusX, radiusY) * 0.6
    );
    anomalyGradient.addColorStop(0, `rgba(0, 20, 40, ${anomalyStrength * 0.8})`);
    anomalyGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = anomalyGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX * 0.6, radiusY * 0.8, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add SAR-like scan lines (range direction)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.015)";
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Add azimuth lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.008)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < width; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Coastline hint (subtle)
  ctx.strokeStyle = "rgba(0, 180, 212, 0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.05, height * 0.1);
  ctx.bezierCurveTo(
    width * 0.3, height * 0.2,
    width * 0.5, height * 0.45,
    width * 0.8, height * 0.6
  );
  ctx.stroke();

  return canvas.toBuffer("image/png");
}

// Generate images
const outputDir = "public/demo/sar";
mkdirSync(outputDir, { recursive: true });

// Current SAR image (with anomaly)
const currentSAR = generateSARImage(1024, 768, 0.4);
writeFileSync(`${outputDir}/demo-sar-current.png`, currentSAR);

// Previous SAR image (less anomaly, slightly different)
const previousSAR = generateSARImage(1024, 768, 0.15);
writeFileSync(`${outputDir}/demo-sar-previous.png`, previousSAR);

// Also create a small thumbnail version
const thumbCurrent = generateSARImage(512, 384, 0.4);
writeFileSync(`${outputDir}/demo-sar-current-thumb.png`, thumbCurrent);

const thumbPrevious = generateSARImage(512, 384, 0.15);
writeFileSync(`${outputDir}/demo-sar-previous-thumb.png`, thumbPrevious);

console.log("Demo SAR images generated successfully!");
console.log(`- ${outputDir}/demo-sar-current.png`);
console.log(`- ${outputDir}/demo-sar-previous.png`);
console.log(`- ${outputDir}/demo-sar-current-thumb.png`);
console.log(`- ${outputDir}/demo-sar-previous-thumb.png`);

console.log("\nAll images generated successfully!");
console.log("Images are deterministic (no Math.random for anomaly placement)");
console.log("Clearly labeled as DEMO/SIMULATED SAR data");