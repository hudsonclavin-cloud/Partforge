#!/usr/bin/env python3
"""Generate the DXF fixtures the reader is tested against.

These are written by ezdxf (MIT), a mature DXF library, NOT by hand and NOT by the
reader under test. That is the point: a parser checked only against files its own
author wrote proves the author's assumptions are self-consistent, not that it reads
what real CAD emits. ezdxf is a development-time fixture generator; nothing in the
shipped app depends on it.

    pip install ezdxf && python3 tools/db/make-dxf-fixtures.py
"""
import ezdxf, os
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'tests', 'fixtures', 'dxf')
os.makedirs(OUT, exist_ok=True)

def new(units=4, version='R2010'):
    d = ezdxf.new(version); d.units = units; return d, d.modelspace()

# 1. plate with two holes, mm, one layer — the happy path
d, m = new()
m.add_lwpolyline([(0,0),(80,0),(80,40),(0,40)], close=True, dxfattribs={'layer':'PROFILE'})
m.add_circle((20,20), 5, dxfattribs={'layer':'PROFILE'})
m.add_circle((60,20), 5, dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'plate-two-holes-mm.dxf'))

# 2. the same plate in INCHES — must come out 25.4x bigger, never silently wrong
d, m = new(units=1)
m.add_lwpolyline([(0,0),(2,0),(2,1),(0,1)], close=True, dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'plate-inches.dxf'))

# 3. unitless — must REFUSE rather than assume mm
d, m = new(units=0)
m.add_lwpolyline([(0,0),(50,0),(50,25),(0,25)], close=True, dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'plate-unitless.dxf'))

# 4. a bulged corner: an arc carried as LWPOLYLINE group code 42
d, m = new()
m.add_lwpolyline([(0,0,0,0,0),(60,0,0,0,0.4142),(60,20,0,0,0),(0,20,0,0,0)],
                 format='xyseb', close=True, dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'bulge-corner-mm.dxf'))

# 5. an OPEN contour — a real and common export mistake; must refuse with the gap
d, m = new()
m.add_line((0,0),(50,0), dxfattribs={'layer':'PROFILE'})
m.add_line((50,0),(50,30), dxfattribs={'layer':'PROFILE'})
m.add_line((50,30),(0,30), dxfattribs={'layer':'PROFILE'})   # last edge deliberately missing
d.saveas(os.path.join(OUT, 'open-contour-mm.dxf'))

# 6. loose LINE/ARC segments that DO close, out of order — must chain
d, m = new()
m.add_line((0,30),(0,0), dxfattribs={'layer':'PROFILE'})
m.add_line((50,0),(50,30), dxfattribs={'layer':'PROFILE'})
m.add_line((0,0),(50,0), dxfattribs={'layer':'PROFILE'})
m.add_line((50,30),(0,30), dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'loose-segments-mm.dxf'))

# 7. several layers with geometry — must refuse to guess which is the profile
d, m = new()
m.add_lwpolyline([(0,0),(40,0),(40,40),(0,40)], close=True, dxfattribs={'layer':'PROFILE'})
m.add_lwpolyline([(-5,-5),(45,-5),(45,45),(-5,45)], close=True, dxfattribs={'layer':'BORDER'})
m.add_circle((20,20), 3, dxfattribs={'layer':'CENTER'})
d.saveas(os.path.join(OUT, 'multi-layer-mm.dxf'))

# 8. a turned section for rotate_extrude: clear of the axis
d, m = new()
m.add_lwpolyline([(20,0),(50,0),(50,8),(30,8),(30,25),(20,25)], close=True, dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'turned-section-mm.dxf'))

# 9. a self-intersecting bow-tie — must refuse
d, m = new()
m.add_lwpolyline([(0,0),(40,40),(40,0),(0,40)], close=True, dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'self-intersecting-mm.dxf'))

# 10. old-style POLYLINE/VERTEX (R12), still what many exporters emit
d, m = new(version='R12')
d.units = 4
pl = m.add_polyline2d([(0,0),(30,0),(30,15),(0,15)], dxfattribs={'layer':'PROFILE'})
pl.close(True)
d.saveas(os.path.join(OUT, 'r12-polyline-mm.dxf'))

# 11. a SPLINE, which this reader cannot honour — must warn, not silently drop
d, m = new()
m.add_lwpolyline([(0,0),(40,0),(40,20),(0,20)], close=True, dxfattribs={'layer':'PROFILE'})
m.add_spline([(5,5),(10,15),(20,5),(30,15)], dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'has-spline-mm.dxf'))

# 12. two separate outer contours on one layer — one profile per part, so refuse
d, m = new()
m.add_lwpolyline([(0,0),(20,0),(20,20),(0,20)], close=True, dxfattribs={'layer':'PROFILE'})
m.add_lwpolyline([(40,0),(60,0),(60,20),(40,20)], close=True, dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'two-outers-mm.dxf'))

# 13. a section drawn symmetric about the axis: legal for an extrude, but
# rotate_extrude() refuses negative X, so the reader must say so
d, m = new()
m.add_lwpolyline([(-25,0),(25,0),(25,10),(-25,10)], close=True, dxfattribs={'layer':'PROFILE'})
d.saveas(os.path.join(OUT, 'crosses-axis-mm.dxf'))

print('wrote', len([f for f in os.listdir(OUT) if f.endswith('.dxf')]), 'fixtures to tests/fixtures/dxf/')
