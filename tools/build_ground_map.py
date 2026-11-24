"""Rebuild terrain placements with Python and Pillow: python tools/build_ground_map.py."""
import json
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
placements = []

def road_centerline(points, width):
    """Zhang-Suen thinning preserves bends and junctions in the road mask."""
    points = set(points)
    offsets = (-width, -width+1, 1, width+1, width, width-1, -1, -width-1)
    while True:
        changed = False
        for phase in range(2):
            remove = []
            for p in points:
                n = [p+d in points for d in offsets]
                if not 2 <= sum(n) <= 6:
                    continue
                if sum(not n[i] and n[(i+1) % 8] for i in range(8)) != 1:
                    continue
                triples = ((0,2,4),(2,4,6)) if phase == 0 else ((0,2,6),(0,4,6))
                if all(not all(n[i] for i in triple) for triple in triples):
                    remove.append(p)
            if remove:
                points.difference_update(remove)
                changed = True
        if not changed:
            return points

def patrol_path(start, skeleton, width):
    def walk(first, previous, used):
        path = [first]
        while len(path) < 1200:
            p = path[-1]
            x,y = p % width, p // width
            neighbors = [p+dy*width+dx for dx,dy in ((0,-1),(1,-1),(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1))
                         if 0 <= x+dx < width and p+dy*width+dx in skeleton and p+dy*width+dx not in used]
            if not neighbors:
                break
            vx,vy = x-previous % width,y-previous // width
            q = max(neighbors, key=lambda q: ((q % width-x)*vx+(q // width-y)*vy) / (((q % width-x)**2+(q // width-y)**2)**0.5))
            used.add(q)
            path.append(q)
            previous = p
        return path
    used = {start}
    forward = walk(start, start+width, used)
    backward = walk(start, forward[1] if len(forward)>1 else start-width, used)
    route = list(reversed(backward[1:])) + forward
    # Keep corners, dropping only exactly collinear intermediate pixels.
    result = []
    for i,p in enumerate(route):
        xy = [p % width, p // width]
        if 0 < i < len(route)-1:
            a,b = route[i-1],route[i+1]
            if (p % width-a % width,p // width-a // width) == (b % width-p % width,b // width-p // width):
                continue
        result.append(xy)
    return result

for segment in range(4):
    image = Image.open(ROOT / f"assets/images/terrain {segment + 1}.png").convert("RGB")
    width, height = image.size
    pixels = list(image.get_flattened_data())
    tan = {i for i, (r, g, b) in enumerate(pixels) if r >= 105 and g >= 100 and 35 <= b < 115 and abs(r-g) < 55}
    roads, clearings = set(), set()
    reserved = []
    while tan:
        seed = tan.pop()
        component = {seed}
        queue = deque([seed])
        while queue:
            i = queue.popleft()
            x, y = i % width, i // width
            for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                j = ny * width + nx
                if 0 <= nx < width and 0 <= ny < height and j in tan:
                    tan.remove(j)
                    component.add(j)
                    queue.append(j)
        (clearings if len(component) < 3500 else roads).update(component)
        if 900 <= len(component) < 3500:
            xs = [p % width for p in component]
            ys = [p // width for p in component]
            # These round, isolated dirt patches match clearings.png. A square
            # erosion can discard them despite ample room for a ground sprite.
            if max(xs)-min(xs) >= 36 and max(ys)-min(ys) >= 36:
                cx, cy = sum(xs)/len(xs), sum(ys)/len(ys)
                center = min(component, key=lambda p: (p % width-cx)**2+(p // width-cy)**2)
                x,y = center % width, center // width
                if 18 <= x < width-18 and all((y+dy)*width+x+dx in component for dx in range(-10,11) for dy in range(-10,11)):
                    reserved.append((x,y))
    grass = {i for i, (r,g,b) in enumerate(pixels) if g >= 120 and g-r >= 42 and b < 85}
    skeleton = road_centerline({p for p in roads if 1 <= p % width < width-1 and width <= p < width*(height-1)}, width)
    occupied = list(reserved)
    for x,y in reserved:
        placements.append({"segment": segment, "x": x, "y": y,
                           "kind": "logram", "terrain": "dirt", "reservedClearing": True})
    # Stationary targets need a 37-pixel-wide clearing, wider than ordinary
    # road lanes. Tanks alone use the narrow road centerlines.
    for terrain, indices, radius, spacing in (("dirt", clearings | roads, 18, 70), ("grass", grass, 18, 70), ("road", roads, 4, 45)):
        mask = Image.new("L", image.size)
        mask.putdata([255 if i in indices else 0 for i in range(width * height)])
        if terrain == "grass":
            # Open grass has dark texture flecks; forest has a much lower
            # bright-green density. Ignore flecks without admitting trees.
            mask = mask.filter(ImageFilter.BoxBlur(3)).point(lambda value: 255 if value >= 195 else 0)
        # Erode the mask to keep each sprite footprint inside its terrain.
        interior = mask.filter(ImageFilter.MinFilter(radius * 2 + 1))
        candidates = [(x,y) for y in range(height-12, 11, -4) for x in range(18,width-18,4) if interior.getpixel((x,y))]
        if terrain == "road":
            candidates = sorted(((p % width, p // width) for p in skeleton if 18 <= p % width < width-18), key=lambda p: (-p[1], p[0]))
        for x,y in candidates:
            if any((x-px)**2 + (y-py)**2 < spacing**2 for px,py in occupied):
                continue
            occupied.append((x,y))
            kind = "grabda" if terrain == "road" else ["logram", "zolba", "barra", "derota"][len(placements) % 4]
            placement = {"segment": segment, "x": x, "y": y, "kind": kind, "terrain": terrain}
            if terrain == "road":
                path = patrol_path(y*width+x, skeleton, width)
                if len(path) < 2:
                    continue
                placement["path"] = path
            placements.append(placement)
    print(f"Terrain {segment+1}: {len(occupied)} placements")

placements.sort(key=lambda p: (p["segment"], -p["y"], p["x"]))
# Half the previous 80-target map, retaining the lighter opening section.
budgets = [(8, 1), (11, 5), (6, 3), (15, 3)]  # (total, tanks) per terrain
reduced = []
for segment, (total, tanks) in enumerate(budgets):
    for is_tank, count in ((True, tanks), (False, total - tanks)):
        candidates = [p for p in placements if p["segment"] == segment and (p["kind"] == "grabda") == is_tank]
        if len(candidates) < count:
            raise ValueError(f"Terrain {segment+1}: not enough suitable sites for {count} targets")
        required = [p for p in candidates if p.get("reservedClearing")]
        if len(required) > count:
            raise ValueError(f"Terrain {segment+1}: clearing reservations exceed target budget")
        reduced.extend(required)
        candidates = [p for p in candidates if not p.get("reservedClearing")]
        count -= len(required)
        # Sample evenly in travel order, rather than clustering at the start.
        reduced.extend(candidates[int((i + 0.5) * len(candidates) / count)] for i in range(count))
placements = sorted(reduced, key=lambda p: (p["segment"], -p["y"], p["x"]))
print(f"Reduced map: {len(placements)} placements")
(ROOT / "js/GroundMap.js").write_text("// Generated by tools/build_ground_map.py; coordinates are terrain image pixels.\nexport const GROUND_MAP = " + json.dumps(placements, indent=2) + ";\n")
