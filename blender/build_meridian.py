"""
Wheeler & Rawson — "Meridian" fountain pen
Procedural, dimensionally accurate build script for Blender 4.2+ / 5.x.

Run inside Blender (Scripting tab or via MCP):
    exec(open(r"<project>/blender/build_meridian.py").read())

All dimensions are authored in millimetres and converted to metres (glTF unit).
Pen axis = Blender +Z (becomes +Y in glTF). Nib points to +Z, nib top faces +X.
The clip sits on +X so it aligns with the nib, as on a real pen.

Every mesh keeps its vertices in pen space (origin on the axis) unless noted,
so the web assembly engine can screw/slide parts about the shared axis.

Objects whose origin is NOT at the pen origin (driven individually in code):
    nib_tip             -> origin at tipping centre   (scaled per nib size)
    clip_wheel_roller   -> origin at wheel axle        (spins on its local Y)
    converter_piston    -> origin at piston centre     (moves along Z)
    converter_rod       -> origin at rod base          (stretches along Z)
    converter_ink       -> origin at ink top surface   (scaled along Z = fill)
    cartridge_ink       -> origin at ink top surface
"""

import bpy
import bmesh
import math
import os

S = 0.001  # mm -> m
TAU = math.tau

PROJECT_DIR = globals().get("PROJECT_DIR", r"C:\work\projects\fountain-pen-configurator")
BLEND_PATH = os.path.join(PROJECT_DIR, "blender", "meridian.blend")
EXPORT_PATH = os.path.join(PROJECT_DIR, "blender", "export", "meridian_raw.glb")


# --------------------------------------------------------------------------
# Scene reset
# --------------------------------------------------------------------------
def reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    sc.unit_settings.length_unit = "MILLIMETERS"


def get_collection(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    p = parent or bpy.context.scene.collection
    if c.name not in [x.name for x in p.children]:
        p.children.link(c)
    return c


# --------------------------------------------------------------------------
# Geometry helpers (bmesh)
# --------------------------------------------------------------------------
class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def face(self, verts, uvs):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        f.smooth = True
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv].uv = uv
        return f

    # ---- surfaces of revolution -------------------------------------------
    def lathe(self, profile, seg=96, closed=False, rmod=None, vscale=1 / 200.0):
        """profile: list of (r, z) or (r, z, 's') in mm, traversed CCW in the
        (r, z) half-plane (bottom outward, outer up, top inward, inner down) so
        normals face outward. 's' marks a hard (split-normal) corner."""
        pts = list(profile)
        if closed:
            pts.append(pts[0][:2] + ("s",) if len(pts[0]) > 2 else pts[0])
        strips, cur = [], [pts[0]]
        for p in pts[1:]:
            cur.append(p)
            if len(p) > 2 and "s" in p[2]:
                strips.append(cur)
                cur = [p]
        if len(cur) > 1:
            strips.append(cur)
        for st in strips:
            self._lathe_strip(st, seg, rmod, vscale)

    def _ring(self, r, z, seg, rmod):
        if r < 1e-6:
            return ("pole", self.bm.verts.new((0.0, 0.0, z * S)))
        ring = []
        for j in range(seg + 1):
            th = TAU * j / seg
            rr = r + (rmod(th, z) if rmod else 0.0)
            ring.append(self.bm.verts.new((rr * math.cos(th) * S, rr * math.sin(th) * S, z * S)))
        return ("ring", ring)

    def _lathe_strip(self, st, seg, rmod, vscale):
        rings = [self._ring(p[0], p[1], seg, rmod) for p in st]
        for i in range(len(st) - 1):
            a, b = rings[i], rings[i + 1]
            # v = (z + 40 mm) / 200 mm keeps every part inside [0, 1] so UVs quantise
            va, vb = (st[i][1] + 40.0) * vscale, (st[i + 1][1] + 40.0) * vscale
            for j in range(seg):
                u0, u1 = j / seg, (j + 1) / seg
                if a[0] == "pole" and b[0] == "pole":
                    continue
                if a[0] == "pole":
                    self.face([a[1], b[1][j + 1], b[1][j]], [((u0 + u1) / 2, va), (u1, vb), (u0, vb)])
                elif b[0] == "pole":
                    self.face([a[1][j], a[1][j + 1], b[1]], [(u0, va), (u1, va), ((u0 + u1) / 2, vb)])
                else:
                    self.face(
                        [a[1][j], a[1][j + 1], b[1][j + 1], b[1][j]],
                        [(u0, va), (u1, va), (u1, vb), (u0, vb)],
                    )

    # ---- helical threads ------------------------------------------------------
    def thread(self, z0, length, r_root, r_crest, lead, starts=1, base=0.9, seg_per_turn=72):
        """Triangular helical ridge(s) sitting on a core cylinder of r_root.
        r_crest > r_root -> male (external) thread; < r_root -> female (internal).
        Crest height runs out over a quarter turn at each end."""
        turns = length / lead
        n = max(8, int(turns * seg_per_turn))
        male = r_crest > r_root
        for s in range(starts):
            off = TAU * s / starts
            slices = []
            for i in range(n + 1):
                t = i / n
                th = off + TAU * turns * t
                zc = z0 + length * t
                env = min(1.0, t * turns * 4.0, (1.0 - t) * turns * 4.0)
                env = env * env * (3 - 2 * env)
                rc = r_root + (r_crest - r_root) * env
                prof = [(r_root, zc - base / 2), (rc, zc), (r_root, zc + base / 2)]
                if not male:
                    prof = prof[::-1]
                c, sn = math.cos(th), math.sin(th)
                slices.append([self.bm.verts.new((r * c * S, r * sn * S, z * S)) for r, z in prof])
            for i in range(n):
                u0, u1 = i / n, (i + 1) / n
                for k in range(2):
                    self.face(
                        [slices[i][k], slices[i + 1][k], slices[i + 1][k + 1], slices[i][k + 1]],
                        [(u0, k / 2), (u1, k / 2), (u1, (k + 1) / 2), (u0, (k + 1) / 2)],
                    )

    # ---- lofted closed cross-sections --------------------------------------
    def loft(self, sections, close_start=True, close_end=True):
        """sections: list of (z, [ (x, y), ... ]) closed rings, same count."""
        rings = []
        for z, pts in sections:
            rings.append([self.bm.verts.new((x * S, y * S, z * S)) for x, y in pts])
        m = len(sections[0][1])
        nz = len(sections)
        for i in range(nz - 1):
            for j in range(m):
                k = (j + 1) % m
                self.face(
                    [rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]],
                    [(j / m, i / nz), ((j + 1) / m, i / nz), ((j + 1) / m, (i + 1) / nz), (j / m, (i + 1) / nz)],
                )
        if close_start:
            self.face(list(reversed(rings[0])), [(0.5, 0.0)] * m)
        if close_end:
            self.face(rings[-1], [(0.5, 1.0)] * m)

    def finish(self, name, collection, material=None, location=(0, 0, 0), recalc=False):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7) if recalc else None
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        collection.objects.link(ob)
        if material:
            me.materials.append(material)
        if any(abs(c) > 0 for c in location):
            # move origin: geometry is authored in pen space, shift it so the
            # object origin sits at `location` while world position is unchanged
            loc = [c * S for c in location]
            me.transform(__import__("mathutils").Matrix.Translation([-c for c in loc]))
            ob.location = loc
        return ob


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


# --------------------------------------------------------------------------
# Materials (preview look in Blender; the web app assigns its own PBR set)
# --------------------------------------------------------------------------
def principled(name, color, metallic=0.0, rough=0.3, coat=0.0, transmission=0.0, alpha=1.0, ior=1.45):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    for key in ("Coat Weight", "Clearcoat"):
        if key in b.inputs:
            b.inputs[key].default_value = coat
    for key in ("Transmission Weight", "Transmission"):
        if key in b.inputs:
            b.inputs[key].default_value = transmission
    b.inputs["IOR"].default_value = ior
    b.inputs["Alpha"].default_value = alpha
    if alpha < 1.0 or transmission > 0:
        try:
            m.surface_render_method = "BLENDED" if alpha < 1.0 else "DITHERED"
        except Exception:
            pass
    return m


def make_materials():
    return {
        "body": principled("mat_body", (0.035, 0.05, 0.12), rough=0.12, coat=1.0),
        "section": principled("mat_section", (0.012, 0.012, 0.014), rough=0.35, coat=0.6),
        "trim": principled("mat_trim", (0.93, 0.74, 0.42), metallic=1.0, rough=0.16),
        "nib": principled("mat_nib", (0.95, 0.77, 0.45), metallic=1.0, rough=0.12),
        "tip": principled("mat_tip", (0.75, 0.75, 0.76), metallic=1.0, rough=0.2),
        "feed": principled("mat_feed", (0.02, 0.02, 0.02), rough=0.55),
        "glass": principled("mat_converter_tube", (0.9, 0.92, 0.95), rough=0.05, transmission=1.0, ior=1.49),
        "steel": principled("mat_steel", (0.8, 0.8, 0.82), metallic=1.0, rough=0.25),
        "rubber": principled("mat_rubber", (0.02, 0.02, 0.02), rough=0.6),
        "ink": principled("mat_ink", (0.02, 0.06, 0.35), rough=0.1),
        "cartridge": principled("mat_cartridge", (0.15, 0.2, 0.45), rough=0.3, alpha=0.6),
    }


# --------------------------------------------------------------------------
# Part dimensions (mm). Closed pen length 150.2 mm, barrel Ø12.8 mm, cap Ø13.7 mm
# --------------------------------------------------------------------------
D = dict(
    # section <-> barrel thread: 2-start, lead 2.4 mm, 7.2 mm engagement = 3 turns
    sec_thread_z0=80.6, sec_thread_len=7.2, sec_thread_lead=2.4, sec_thread_starts=2,
    # barrel <-> cap thread: 3-start, lead 2.5 mm, 5.0 mm engagement = exactly 2 turns,
    # so the cap (and the finial medallion) comes off with the clip back on top
    cap_thread_z0=83.0, cap_thread_len=5.0, cap_thread_lead=2.5, cap_thread_starts=3,
    nib_base_z=104.0, nib_len=36.0,
)


def build_barrel(col, mats):
    b = Builder()
    b.lathe([
        (0.0, 0.0), (5.3, 0.0, "s"), (5.9, 1.0), (6.25, 3.0), (6.4, 7.0),
        (6.4, 80.8, "s"), (6.0, 80.8, "s"), (5.45, 81.4, "s"),
        (5.45, 88.0, "s"), (4.65, 88.0, "s"),
        (4.65, 3.0, "s"), (0.0, 3.0),
    ], seg=112)
    # external cap thread (male) on the barrel mouth
    b.thread(D["cap_thread_z0"], D["cap_thread_len"], 5.45, 5.75, D["cap_thread_lead"],
             starts=D["cap_thread_starts"], base=0.8)
    # internal section thread (female), visible through demonstrator barrels
    b.thread(D["sec_thread_z0"], D["sec_thread_len"], 4.65, 4.3, D["sec_thread_lead"],
             starts=D["sec_thread_starts"], base=0.95)
    return b.finish("barrel", col, mats["body"])


def build_barrel_trims(col, mats):
    b = Builder()
    b.lathe([(5.95, 80.8), (6.42, 80.8, "s"), (6.5, 80.95), (6.5, 82.45), (6.42, 82.6, "s"),
             (5.95, 82.6, "s")], seg=112, closed=True)
    ring = b.finish("barrel_ring", col, mats["trim"])

    b = Builder()
    b.lathe([(0.0, -1.6), (2.5, -1.52), (4.4, -1.18), (5.3, -0.62), (5.55, -0.1),
             (5.5, 0.05, "s"), (0.0, 0.05)], seg=96)
    fin = b.finish("barrel_finial", col, mats["trim"])
    return ring, fin


def build_section(col, mats):
    b = Builder()
    b.lathe([
        (0.9, 72.0), (1.5, 72.0, "s"), (1.5, 79.6, "s"), (2.4, 80.0, "s"), (4.25, 80.4, "s"),
        (4.25, 88.0, "s"), (5.4, 88.0, "s"), (5.4, 89.4, "s"),
        (5.3, 89.4, "s"), (5.26, 91.0), (5.1, 96.0), (4.8, 102.0), (4.6, 107.5), (4.56, 110.5),
        (4.66, 113.0), (4.92, 114.9), (4.96, 115.6), (4.82, 116.3), (4.5, 116.6, "s"),
        (3.7, 116.6, "s"), (3.7, 100.0, "s"), (0.9, 100.0, "s"),
    ], seg=96, closed=True)
    b.thread(D["sec_thread_z0"], D["sec_thread_len"], 4.25, 4.6, D["sec_thread_lead"],
             starts=D["sec_thread_starts"], base=0.95)
    sec = b.finish("section", col, mats["section"])

    b = Builder()
    b.lathe([(5.2, 88.0), (5.48, 88.0, "s"), (5.56, 88.12), (5.56, 89.28), (5.48, 89.4, "s"),
             (5.2, 89.4, "s")], seg=96, closed=True)
    ring = b.finish("section_ring", col, mats["trim"])
    return sec, ring


def build_cap(col, mats):
    b = Builder()
    # outer shell (open end -> top)
    b.lathe([
        (5.9, 82.7), (6.6, 82.7, "s"), (6.85, 83.1, "s"), (6.85, 139.5), (6.75, 141.4),
        (6.55, 143.1), (6.3, 144.0, "s"), (0.0, 144.0),
    ], seg=112)
    # inner cavity (top -> open end)
    b.lathe([
        (0.0, 142.6), (5.65, 142.6, "s"), (5.65, 89.0, "s"), (5.9, 88.6, "s"), (5.9, 82.7),
    ], seg=112)
    b.thread(D["cap_thread_z0"] + 0.2, D["cap_thread_len"], 5.9, 5.55, D["cap_thread_lead"],
             starts=D["cap_thread_starts"], base=0.8)
    cap = b.finish("cap", col, mats["body"])

    b = Builder()
    b.lathe([(6.82, 84.2), (6.92, 84.2, "s"), (6.99, 84.42), (6.99, 88.98), (6.92, 89.2, "s"),
             (6.82, 89.2, "s")], seg=112, closed=True)
    band = b.finish("cap_band", col, mats["trim"])

    b = Builder()
    b.lathe([(0.0, 144.8), (5.9, 144.8, "s"), (6.18, 145.15), (6.2, 145.9), (6.05, 147.0),
             (5.5, 148.4), (4.6, 149.35), (3.95, 149.7, "s"), (0.0, 149.7)], seg=112)
    fin = b.finish("cap_finial", col, mats["trim"])

    # flat medallion on the finial: planar UVs for the W&R monogram.
    # Seen end-on from outside with the clip (+X) at 12 o'clock, screen right is -Y,
    # so u runs along -Y and v along +X: the canvas reads upright under the clip.
    b = Builder()
    n = 96
    centre = b.bm.verts.new((0, 0, 149.71 * S))
    ring = [b.bm.verts.new((3.9 * math.cos(TAU * j / n) * S, 3.9 * math.sin(TAU * j / n) * S, 149.71 * S))
            for j in range(n)]
    for j in range(n):
        k = (j + 1) % n
        p0, p1 = ring[j].co, ring[k].co
        b.face([centre, ring[j], ring[k]],
               [(0.5, 0.5), (-p0.y / S / 8.0 + 0.5, p0.x / S / 8.0 + 0.5), (-p1.y / S / 8.0 + 0.5, p1.x / S / 8.0 + 0.5)])
    top = b.finish("cap_finial_top", col, mats["trim"])
    return cap, band, fin, top


# ---- clips -------------------------------------------------------------------
def sweep(b, path, width, thick, nprof=16, power=0.35):
    """Sweep a rounded rectangle along a polyline in the XZ plane (y = 0).
    width(i) along Y, thick(i) along the in-plane normal."""
    rings = []
    m = len(path)
    for i, (x, z) in enumerate(path):
        if i == 0:
            tx, tz = path[1][0] - x, path[1][1] - z
        elif i == m - 1:
            tx, tz = x - path[i - 1][0], z - path[i - 1][1]
        else:
            tx, tz = path[i + 1][0] - path[i - 1][0], path[i + 1][1] - path[i - 1][1]
        L = math.hypot(tx, tz) or 1.0
        tx, tz = tx / L, tz / L
        nx, nz = tz, -tx  # in-plane normal
        w, t = width(i / (m - 1)), thick(i / (m - 1))
        ring = []
        for k in range(nprof):
            phi = TAU * k / nprof
            c, s = math.cos(phi), math.sin(phi)
            sy = math.copysign(abs(c) ** power, c) * w / 2
            sn = math.copysign(abs(s) ** power, s) * t / 2
            ring.append(b.bm.verts.new(((x + nx * sn) * S, sy * S, (z + nz * sn) * S)))
        rings.append(ring)
    for i in range(m - 1):
        for k in range(nprof):
            kk = (k + 1) % nprof
            b.face([rings[i][k], rings[i][kk], rings[i + 1][kk], rings[i + 1][k]],
                   [(k / nprof, i / m), ((k + 1) / nprof, i / m), ((k + 1) / nprof, (i + 1) / m), (k / nprof, (i + 1) / m)])
    b.face(list(reversed(rings[0])), [(0.5, 0)] * nprof)
    b.face(rings[-1], [(0.5, 1)] * nprof)


def clip_ring(b):
    b.lathe([(3.6, 144.0), (6.2, 144.0, "s"), (6.28, 144.1), (6.28, 144.7), (6.2, 144.8, "s"),
             (3.6, 144.8, "s")], seg=96, closed=True)


def resample(pts, step=0.5):
    out = [pts[0]]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, z1 - z0)
        n = max(1, int(L / step))
        for i in range(1, n + 1):
            t = i / n
            out.append((lerp(x0, x1, t), lerp(z0, z1, t)))
    return out


def catmull(pts, samples=10):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in range(2)))
    out.append(pts[-1])
    return out


CLIP_TOP = [(5.9, 144.4), (6.7, 144.35), (7.45, 143.9), (7.9, 142.8), (8.02, 141.0)]


def build_clip_classic(col, mats):
    b = Builder()
    clip_ring(b)
    path = catmull(CLIP_TOP + [(8.0, 132.0), (7.92, 124.0), (7.72, 119.0), (7.55, 117.6)], samples=8)
    sweep(b, path, width=lambda t: lerp(3.5, 2.5, smoothstep(0.15, 1.0, t)), thick=lambda t: 0.95)
    # ball end
    b.lathe([(0.0, -1.05), (0.55, -0.9), (0.9, -0.52), (1.05, 0.0), (0.9, 0.52), (0.55, 0.9), (0.0, 1.05)], seg=48)
    ob = b.finish("clip_classic", col, mats["trim"])
    # move the ball (last lathe) into place: it was authored around z=0 on the axis
    me = ob.data
    for v in me.vertices:
        if abs(v.co.x) < 1.2 * S and abs(v.co.y) < 1.2 * S and abs(v.co.z) < 1.2 * S:
            v.co.x += 7.62 * S
            v.co.z += 117.2 * S
    return ob


def build_clip_wheel(col, mats):
    b = Builder()
    clip_ring(b)
    path = catmull(CLIP_TOP + [(8.0, 130.0), (7.98, 122.0), (7.9, 120.2)], samples=8)
    sweep(b, path, width=lambda t: 3.1, thick=lambda t: 1.0)
    # fork cheeks holding the roller
    for side in (-1, 1):
        y0 = side * 1.05
        pts = [(6.95, 116.0), (8.35, 116.0), (8.35, 120.6), (6.95, 120.6)]
        verts = []
        for yy in (y0 - 0.22, y0 + 0.22):
            verts.append([b.bm.verts.new((x * S, yy * S, z * S)) for x, z in pts])
        a, c = verts
        b.face(list(reversed(a)), [(0, 0)] * 4)
        b.face(c, [(0, 0)] * 4)
        for k in range(4):
            kk = (k + 1) % 4
            b.face([a[k], a[kk], c[kk], c[k]], [(0, 0)] * 4)
    ob = b.finish("clip_wheel", col, mats["trim"], recalc=False)

    # the roller: a knurled wheel spinning on its local Y axis
    r = Builder()
    knurl = lambda th, z: 0.07 * abs(math.sin(14 * th)) if abs(z) < 0.62 else 0.0
    r.lathe([(0.0, -0.8), (1.1, -0.8, "s"), (1.32, -0.68), (1.38, -0.5), (1.38, 0.5), (1.32, 0.68),
             (1.1, 0.8, "s"), (0.0, 0.8)], seg=112, rmod=knurl)
    roller = r.finish("clip_wheel_roller", col, mats["trim"])
    # lathe was built around Z; rotate geometry so the axle is along Y
    import mathutils
    roller.data.transform(mathutils.Matrix.Rotation(math.pi / 2, 4, "X"))
    roller.location = (7.62 * S, 0.0, 117.55 * S)
    return ob, roller


def build_clip_minimal(col, mats):
    b = Builder()
    clip_ring(b)
    path = catmull(CLIP_TOP + [(8.0, 130.0), (7.9, 121.6), (7.62, 119.6)], samples=8)
    sweep(b, path, width=lambda t: 2.7, thick=lambda t: 1.15, power=0.12)
    return b.finish("clip_minimal", col, mats["trim"])


# ---- nib unit ------------------------------------------------------------------
def nib_height(t):
    """x-height of the nib's top centreline above the pen axis."""
    if t < 0.36:
        return 3.55
    u = (t - 0.36) / 0.64
    return 3.55 - (3.55 - 0.62) * (u ** 1.18)


def nib_radius(t):
    return lerp(3.72, 13.0, smoothstep(0.36, 1.0, t))


def nib_halfwidth(t):
    if t <= 0.42:
        return 4.0
    if t <= 0.56:  # shoulders, concave sweep
        u = (t - 0.42) / 0.14
        return lerp(4.0, 3.15, 1 - (1 - u) ** 2.2)
    if t <= 0.975:  # body taper, slightly convex
        u = (t - 0.56) / 0.415
        return lerp(3.15, 0.55, u ** 1.25)
    u = (t - 0.975) / 0.025
    return 0.55 * math.sqrt(max(0.0, 1 - u * u)) + 0.02


NIB_UV_W = 9.0  # u = s / 9 + 0.5 ; v = t  (documented for the web imprint texture)


def nib_point(s, t):
    R, h = nib_radius(t), nib_height(t)
    a = s / R
    return ((h - R) + R * math.cos(a), R * math.sin(a), D["nib_base_z"] + D["nib_len"] * t)


def build_nib(col, mats):
    b = Builder()
    nt, ns = 140, 41
    grid = []
    for i in range(nt + 1):
        t = i / nt
        w = nib_halfwidth(t)
        row = []
        for j in range(ns):
            sig = j / (ns - 1) * 2 - 1
            s = w * sig
            x, y, z = nib_point(s, t)
            v = b.bm.verts.new((x * S, y * S, z * S))
            row.append((v, (s / NIB_UV_W + 0.5, t)))
        grid.append(row)
    for i in range(nt):
        for j in range(ns - 1):
            a, bb, c, d = grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]
            b.face([a[0], bb[0], c[0], d[0]], [a[1], bb[1], c[1], d[1]])
    nib = b.finish("nib", col, mats["nib"])
    mod = nib.modifiers.new("thickness", "SOLIDIFY")
    mod.thickness = 0.3 * S
    mod.offset = -1.0
    mod.use_even_offset = True
    mod.use_quality_normals = True
    return nib


def make_cutter(col):
    """Breather hole + slit, used as a boolean cutter for nib and tipping."""
    import mathutils
    t_hole = 0.6
    hx, hy, hz = nib_point(0.0, t_hole)
    b = Builder()
    # breather hole: cylinder along X
    n = 40
    r = 0.52
    a_ring, b_ring = [], []
    for j in range(n):
        th = TAU * j / n
        y, z = r * math.cos(th), hz + r * math.sin(th)
        a_ring.append(b.bm.verts.new((-4.0 * S, y * S, z * S)))
        b_ring.append(b.bm.verts.new((8.0 * S, y * S, z * S)))
    for j in range(n):
        k = (j + 1) % n
        b.face([a_ring[j], a_ring[k], b_ring[k], b_ring[j]], [(0, 0)] * 4)
    b.face(list(reversed(a_ring)), [(0, 0)] * n)
    b.face(b_ring, [(0, 0)] * n)
    hole = b.finish("_cut_hole", col, recalc=True)

    b = Builder()
    bmesh.ops.create_cube(b.bm, size=1.0)
    bmesh.ops.scale(b.bm, vec=(12.0 * S, 0.075 * S, 16.0 * S), verts=b.bm.verts)
    bmesh.ops.translate(b.bm, vec=(2.0 * S, 0.0, (hz + 8.0) * S), verts=b.bm.verts)
    slit = b.finish("_cut_slit", col)
    return hole, slit


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.name = old.name
    bpy.data.meshes.remove(old)


def boolean_cut(ob, cutters):
    for c in cutters:
        m = ob.modifiers.new("cut_" + c.name, "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.solver = "EXACT"
        m.object = c
    apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True


def build_tip(col, mats):
    import mathutils
    b = Builder()
    b.lathe([(0.0, -0.66), (0.34, -0.6), (0.6, -0.4), (0.72, -0.1), (0.72, 0.12), (0.58, 0.42), (0.32, 0.6),
             (0.0, 0.66)], seg=48)
    tip = b.finish("nib_tip", col, mats["tip"])
    tip.data.transform(mathutils.Matrix.Scale(1.0, 4))
    x, y, z = nib_point(0.0, 0.985)
    # sit the tipping just under the nib's end, centred on the slit
    tip.location = ((x - 0.42) * S, 0.0, (z + 0.12) * S)
    return tip


def build_feed(col, mats):
    b = Builder()
    m = 48
    sections = []
    z_start, z_lip, z_end = 99.0, 116.6, 138.4
    zs = []
    z = z_start
    while z < z_end:
        zs.append(z)
        z += 0.12 if 116.0 < z < 129.0 else 0.6
    zs.append(z_end)
    for z in zs:
        if z <= z_lip:
            xc, a, bw = 0.0, 3.25, 3.25
            top = 3.25
        else:
            t = (z - D["nib_base_z"]) / D["nib_len"]
            top = nib_height(t) - 0.33 - 0.04
            u = (z - z_lip) / (z_end - z_lip)
            bot = lerp(-3.25, top - 0.55, smoothstep(0.0, 1.0, u) ** 0.8)
            bw = lerp(3.25, 1.05, smoothstep(0.0, 0.85, u))
            if u > 0.93:  # rounded nose
                k = (u - 0.93) / 0.07
                bw *= math.sqrt(max(0.02, 1 - k * k))
                bot = lerp(bot, top - 0.2, k * k)
            xc, a = (top + bot) / 2, (top - bot) / 2
        # fins: comb grooves on the underside of the exposed feed
        groove = 0.0
        if 117.4 < z < 128.6:
            g = 0.5 + 0.5 * math.cos(TAU * (z - 117.4) / 1.25)
            groove = g ** 6
        pts = []
        for k in range(m):
            phi = TAU * k / m
            c, s = math.cos(phi), math.sin(phi)
            rx = a
            if c < -0.15:
                rx = a * (1.0 - 0.17 * groove * min(1.0, (-c - 0.15) * 3))
            pts.append((xc + rx * c, bw * s * (0.97 if c > 0.6 else 1.0)))
        sections.append((z, pts))
    b.loft(sections)
    return b.finish("feed", col, mats["feed"])


# ---- filling systems --------------------------------------------------------------
CONV = dict(knob_z0=18.0, tube_z0=26.2, tube_z1=72.2, ink_top=72.1, piston_full=34.5, piston_empty=70.0, rod_base=26.6)


def build_converter(col, mats):
    knurl = lambda th, z: 0.09 * abs(math.sin(12 * th)) if 19.0 <= z <= 25.0 else 0.0
    b = Builder()
    b.lathe([(0.0, 18.0), (2.6, 18.0, "s"), (2.92, 18.3), (3.0, 18.7), (3.0, 19.0), (3.0, 21.0), (3.0, 23.0),
             (3.0, 25.0), (3.0, 25.4), (2.85, 25.85), (2.2, 26.0, "s"), (2.2, 26.6, "s"), (0.0, 26.6)],
            seg=144, rmod=knurl)
    knob = b.finish("converter_knob", col, mats["steel"])

    b = Builder()
    b.lathe([(2.25, 26.2), (3.15, 26.2, "s"), (3.3, 26.5), (3.3, 72.2, "s"), (2.92, 72.2, "s"),
             (2.92, 26.9, "s"), (2.25, 26.9, "s")], seg=96, closed=True)
    tube = b.finish("converter_tube", col, mats["glass"])

    b = Builder()
    b.lathe([(2.95, 71.6), (3.38, 71.6, "s"), (3.43, 72.0), (3.43, 78.3), (3.3, 78.9), (3.05, 79.6, "s"),
             (1.55, 79.6, "s"), (1.55, 73.0, "s"), (2.95, 73.0, "s")], seg=96, closed=True)
    collar = b.finish("converter_collar", col, mats["steel"])

    b = Builder()
    b.lathe([(0.0, -1.5), (2.7, -1.5, "s"), (2.88, -1.2), (2.88, -0.3), (2.8, 0.0), (2.88, 0.3), (2.88, 1.2),
             (2.7, 1.5, "s"), (0.0, 1.5)], seg=64)
    piston = b.finish("converter_piston", col, mats["rubber"])
    piston.location = (0, 0, CONV["piston_full"] * S)

    b = Builder()
    L = CONV["piston_full"] - CONV["rod_base"]
    b.lathe([(0.0, 0.0), (0.55, 0.0, "s"), (0.55, L, "s"), (0.0, L)], seg=24)
    rod = b.finish("converter_rod", col, mats["steel"])
    rod.location = (0, 0, CONV["rod_base"] * S)

    b = Builder()
    Lk = CONV["ink_top"] - (CONV["piston_full"] + 1.5)
    b.lathe([(0.0, -Lk), (2.86, -Lk, "s"), (2.86, 0.0, "s"), (0.0, 0.0)], seg=64)
    ink = b.finish("converter_ink", col, mats["ink"])
    ink.location = (0, 0, CONV["ink_top"] * S)
    return knob, tube, collar, piston, rod, ink


def build_cartridge(col, mats):
    b = Builder()
    b.lathe([(0.0, 34.0), (1.6, 34.08), (2.45, 34.35), (2.95, 34.9), (3.15, 35.9), (3.15, 74.4), (2.95, 75.4),
             (2.55, 76.0), (2.45, 76.6), (2.45, 79.6, "s"), (0.0, 79.6)], seg=96)
    cart = b.finish("cartridge", col, mats["cartridge"])

    b = Builder()
    L = 74.6 - 35.6
    b.lathe([(0.0, -L), (2.0, -L), (2.7, -L + 0.6), (2.82, -L + 1.4), (2.82, 0.0, "s"), (0.0, 0.0)], seg=64)
    ink = b.finish("cartridge_ink", col, mats["ink"])
    ink.location = (0, 0, 74.6 * S)
    return cart, ink


# --------------------------------------------------------------------------
# Preview stage (studio camera/lights for Blender renders only)
# --------------------------------------------------------------------------
def build_stage(col):
    import mathutils
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 85
    cam = bpy.data.objects.new("Camera", cam_data)
    col.objects.link(cam)
    cam.location = (0.32, -0.02, 0.1)
    direction = mathutils.Vector((0.0, 0.0, 0.075)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    for name, loc, energy, size in (("Key", (0.25, -0.25, 0.3), 30, 0.3), ("Rim", (-0.3, 0.2, 0.25), 20, 0.4),
                                    ("Fill", (0.2, 0.3, 0.05), 8, 0.5)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        col.objects.link(lo)
        lo.location = loc
        d = mathutils.Vector((0, 0, 0.075)) - lo.location
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    w = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.012, 0.014, 0.02, 1)
        bg.inputs[1].default_value = 1.0


# --------------------------------------------------------------------------
def main():
    reset_scene()
    mats = make_materials()
    root = get_collection("WR_Meridian")
    c_body = get_collection("Body", root)
    c_cap = get_collection("Cap", root)
    c_clip = get_collection("Clips", root)
    c_nib = get_collection("NibUnit", root)
    c_fill = get_collection("Filling", root)
    c_tmp = get_collection("_cutters")
    c_stage = get_collection("_stage")

    build_barrel(c_body, mats)
    build_barrel_trims(c_body, mats)
    build_section(c_body, mats)
    build_cap(c_cap, mats)
    build_clip_classic(c_clip, mats)
    build_clip_wheel(c_clip, mats)
    build_clip_minimal(c_clip, mats)

    nib = build_nib(c_nib, mats)
    apply_modifiers(nib)
    tip = build_tip(c_nib, mats)
    hole, slit = make_cutter(c_tmp)
    boolean_cut(nib, [hole, slit])
    boolean_cut(tip, [slit])
    build_feed(c_nib, mats)

    build_converter(c_fill, mats)
    build_cartridge(c_fill, mats)

    for ob in list(c_tmp.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(c_tmp)

    build_stage(c_stage)

    # default variant visibility for Blender previews
    for name in ("clip_wheel", "clip_wheel_roller", "clip_minimal", "cartridge", "cartridge_ink"):
        ob = bpy.data.objects.get(name)
        if ob:
            ob.hide_viewport = True
            ob.hide_render = True

    os.makedirs(os.path.dirname(BLEND_PATH), exist_ok=True)
    os.makedirs(os.path.dirname(EXPORT_PATH), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

    # export every pen part (hidden variants included), no stage objects
    for ob in bpy.data.objects:
        ob.hide_viewport = False
        ob.select_set(ob.users_collection[0].name != "_stage")
    bpy.ops.export_scene.gltf(
        filepath=EXPORT_PATH,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_extras=True,
    )
    for name in ("clip_wheel", "clip_wheel_roller", "clip_minimal", "cartridge", "cartridge_ink"):
        ob = bpy.data.objects.get(name)
        if ob:
            ob.hide_viewport = True
    stats = {ob.name: len(ob.data.polygons) for ob in bpy.data.objects if ob.type == "MESH"}
    return stats


result = main()
