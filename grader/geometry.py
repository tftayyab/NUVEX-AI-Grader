"""
Deterministic, non-AI checks on an exported mesh (STL/OBJ) -- dimensions and
estimated weight against your competition's hard constraints. This is exact
and free, so let it handle anything numeric; let the AI handle judgment calls.

Native CAD formats (STEP/IGES/SLDPRT) aren't read here -- ask teams to export
an STL alongside their drawing views (every CAD tool does this in one click).
If you need to read native files directly, extend this module with a library
like cadquery or pythonocc-core (heavier install, worth it only if you can't
require an STL export from teams).
"""
import trimesh


def check_geometry(mesh_path: str, constraints: dict) -> dict:
    """
    Assumes the mesh was exported in millimeters (the near-universal default
    for STL exports from CAD tools). If your teams export in different units,
    convert `constraints` to match before calling this.
    """
    mesh = trimesh.load(mesh_path, force="mesh")
    length_mm, width_mm, height_mm = mesh.extents

    volume_cm3 = mesh.volume / 1000.0  # mm^3 -> cm^3
    density = constraints.get("material_density_g_cm3", 1.0)
    est_weight_g = volume_cm3 * density

    result = {
        "length_mm": round(float(length_mm), 2),
        "width_mm": round(float(width_mm), 2),
        "height_mm": round(float(height_mm), 2),
        "estimated_weight_g": round(float(est_weight_g), 2),
        "is_watertight": bool(mesh.is_watertight),
        "violations": [],
    }

    if not mesh.is_watertight:
        result["violations"].append("Mesh is not watertight -- volume/weight estimate may be unreliable")
    if "max_length_mm" in constraints and length_mm > constraints["max_length_mm"]:
        result["violations"].append(f"Length {length_mm:.1f}mm exceeds max {constraints['max_length_mm']}mm")
    if "max_width_mm" in constraints and width_mm > constraints["max_width_mm"]:
        result["violations"].append(f"Width {width_mm:.1f}mm exceeds max {constraints['max_width_mm']}mm")
    if "max_weight_g" in constraints and est_weight_g > constraints["max_weight_g"]:
        result["violations"].append(f"Estimated weight {est_weight_g:.1f}g exceeds max {constraints['max_weight_g']}g")

    return result
