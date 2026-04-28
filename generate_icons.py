from PIL import Image, ImageDraw
import math

# Draw a sparkle (4-pointed star) centered at (cx, cy) with given outer and inner radius
def draw_sparkle(draw, cx, cy, outer_r, inner_r, color, rotation=0):
    points = []
    arms = 4
    for i in range(arms * 2):
        angle = math.radians(rotation + i * (360 / (arms * 2)) - 90)
        r = outer_r if i % 2 == 0 else inner_r
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        points.append((x, y))
    draw.polygon(points, fill=color)

sizes = [16, 32, 48, 96, 128]

for size in sizes:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    margin = max(1, size // 16)
    
    # Blue gradient-ish circle (solid blue for simplicity)
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill='#1d9bf0'
    )
    
    cx = size / 2
    cy = size / 2
    
    # White sparkle
    outer_r = size * 0.28
    inner_r = size * 0.10
    draw_sparkle(draw, cx, cy, outer_r, inner_r, (255, 255, 255, 255), rotation=0)
    
    # Tiny center dot for polish
    dot_r = max(1, size // 32)
    draw.ellipse(
        [cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
        fill=(255, 255, 255, 255)
    )
    
    img.save(f'/Volumes/HD/exten/extension/public/icon/{size}.png')
    print(f'Generated {size}x{size} icon')

print('Done!')
