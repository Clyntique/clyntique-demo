import os
import sys
import math
import numpy as np
from PIL import Image, ImageOps, ImageFilter
import imageio_ffmpeg

def create_hero_loop_video():
    input_path = "d:/clyntique-demo/clyntique/public/images/hero-bg.jpg"
    output_path = "d:/clyntique-demo/clyntique/public/videos/hero-loop.mp4"
    
    print("Loading image:", input_path)
    base_img = Image.open(input_path)
    base_img = ImageOps.exif_transpose(base_img)
    base_img = base_img.convert("RGB")
    
    # Target resolution: 1920x1080 (Full HD, 16:9, crystal clear)
    target_w, target_h = 1920, 1080
    
    # Base resize with high quality Lanczos to cover target + margin for Ken Burns
    margin = 80
    render_w = target_w + margin * 2
    render_h = target_h + margin * 2
    
    # Aspect fit/cover
    img_w, img_h = base_img.size
    scale = max(render_w / img_w, render_h / img_h)
    scaled_w = int(img_w * scale)
    scaled_h = int(img_h * scale)
    scaled_img = base_img.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
    
    # Crop to render_w, render_h centered
    left = (scaled_w - render_w) // 2
    top = int((scaled_h - render_h) * 0.25) # bias toward sky & moon
    cropped = scaled_img.crop((left, top, left + render_w, top + render_h))
    
    base_arr = np.array(cropped, dtype=np.float32)
    
    fps = 30
    duration_sec = 8  # 8 second seamless loop
    total_frames = fps * duration_sec
    
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    
    # We will use ffmpeg stdin pipe to stream raw RGB frames directly to MP4 with h264
    import subprocess
    cmd = [
        ffmpeg_exe,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{target_w}x{target_h}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "20",
        "-movflags", "+faststart",
        output_path
    ]
    
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    
    # Pre-generate glowing particles (fireflies / stardust)
    num_particles = 45
    np.random.seed(42)
    particles = []
    for _ in range(num_particles):
        px = np.random.uniform(50, target_w - 50)
        py = np.random.uniform(50, target_h - 50)
        size = np.random.uniform(1.8, 4.5)
        phase = np.random.uniform(0, 2 * math.pi)
        drift_speed = np.random.choice([1, 2]) # integer loops so it resets perfectly
        particles.append({
            "x": px,
            "y": py,
            "size": size,
            "phase": phase,
            "speed": drift_speed,
            "glow": np.random.uniform(0.6, 1.0)
        })
    
    print(f"Rendering {total_frames} frames ({duration_sec}s @ {fps}fps)...")
    
    # Precompute coordinate grids for target window
    xs = np.arange(target_w)
    ys = np.arange(target_h)
    
    for f in range(total_frames):
        t = f / total_frames  # normalized 0.0 to 1.0
        angle = 2.0 * math.pi * t
        
        # 1. Ken Burns camera zoom and gentle drift (sine-curved for exact zero velocity at boundaries)
        # s_curve goes 0 -> 1 -> 0 smoothly
        s_curve = 0.5 * (1.0 - math.cos(angle))
        zoom = 1.0 + 0.04 * s_curve
        pan_x = margin + 25.0 * math.sin(angle)
        pan_y = margin + 15.0 * s_curve
        
        # Calculate source rect in cropped
        crop_w = target_w / zoom
        crop_h = target_h / zoom
        
        cx = pan_x + (target_w - crop_w) / 2
        cy = pan_y + (target_h - crop_h) / 2
        
        # We can extract the subimage and resize to target_w, target_h
        sub = cropped.crop((int(cx), int(cy), int(cx + crop_w), int(cy + crop_h)))
        frame_img = sub.resize((target_w, target_h), Image.Resampling.BILINEAR)
        frame_arr = np.array(frame_img, dtype=np.float32)
        
        # 2. Atmospheric Golden Light & Sky Luminosity Breathing
        # Subtle harmonic breathing: period 1 (8s) and period 2 (4s)
        breathe = 1.0 + 0.035 * math.sin(angle) + 0.015 * math.sin(2 * angle)
        
        # Warm golden tint on the lower half (wheat fields)
        warm_boost = np.linspace(1.0, 1.05 * breathe, target_h).reshape(target_h, 1, 1)
        frame_arr[:, :, 0] *= warm_boost[:, :, 0] # boost red/gold
        frame_arr[:, :, 1] *= (warm_boost[:, :, 0] * 0.98) # boost green slightly
        
        # 3. Fireflies / Stardust particles
        particle_overlay = np.zeros((target_h, target_w, 3), dtype=np.float32)
        for p in particles:
            # integer cycle drift in y
            y_curr = int((p["y"] - p["speed"] * target_h * t) % target_h)
            # slight horizontal sway
            x_curr = int((p["x"] + 12.0 * math.sin(angle + p["phase"])) % target_w)
            
            # Pulse intensity (periodic)
            pulse = 0.5 + 0.5 * math.sin(angle * p["speed"] + p["phase"])
            intensity = p["glow"] * pulse
            
            # Draw smooth gaussian point
            r = int(math.ceil(p["size"] * 2.5))
            y0 = max(0, y_curr - r)
            y1 = min(target_h, y_curr + r + 1)
            x0 = max(0, x_curr - r)
            x1 = min(target_w, x_curr + r + 1)
            
            if y1 > y0 and x1 > x0:
                grid_y, grid_x = np.ogrid[y0 - y_curr:y1 - y_curr, x0 - x_curr:x1 - x_curr]
                dist_sq = grid_x**2 + grid_y**2
                alpha = np.exp(-dist_sq / (2.0 * (p["size"]**2))) * intensity
                
                # Warm golden glow (RGB: 255, 215, 120)
                gold_r = 255.0 * alpha
                gold_g = 215.0 * alpha
                gold_b = 110.0 * alpha
                
                particle_overlay[y0:y1, x0:x1, 0] += gold_r
                particle_overlay[y0:y1, x0:x1, 1] += gold_g
                particle_overlay[y0:y1, x0:x1, 2] += gold_b
        
        # Add particles with screen blend
        frame_arr = frame_arr + particle_overlay - (frame_arr * particle_overlay / 255.0)
        
        # Clamp to [0, 255]
        frame_arr = np.clip(frame_arr, 0, 255).astype(np.uint8)
        
        proc.stdin.write(frame_arr.tobytes())
        
        if (f + 1) % 60 == 0 or f == total_frames - 1:
            print(f"Rendered {f + 1}/{total_frames} frames...")
            
    proc.stdin.close()
    proc.wait()
    print("Video generation completed successfully:", output_path)

if __name__ == "__main__":
    create_hero_loop_video()
