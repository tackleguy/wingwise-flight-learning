#!/usr/bin/env python3
"""
TeachX Flight Simulator - generator for the tuned Cessna 172P JSBSim data files.

Writes (from the parameters in PARAMS below):
    ../aircraft/c172p/c172p.xml      from c172p.template.xml + generated aerodynamics
    ../engine/eng_io320.xml          engine
    ../engine/prop_75in2f.xml        propeller

Why a generator: the lift / drag / moment tables cover the whole angle-of-attack range (-180..180
degrees) for several flap settings and must stay consistent with each other (drag is computed from
lift, the left and right wing panels use the same lift curve, ...). Editing a few parameters here
and regenerating is far less error-prone than editing hundreds of table numbers by hand.

Usage:
    python3 gen_model.py                 regenerate the three XML files in place
    python3 gen_model.py --out DIR       write them under DIR instead (DIR/aircraft/..., DIR/engine/...)
    python3 gen_model.py --set K=V ...   override parameters (numbers or JSON lists) for experiments
    python3 gen_model.py --print         print the parameters as JSON

Everything here is original TeachX work (no FlightGear data). Sources for the physics are named in
the comments and in ../CHANGES.md. This is a learning aid, not validated flight-training data.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------------------------
PARAMS = {
    # ---- geometry used by the generated functions
    "span_ft": 35.8,
    "wing_area": 174.0,
    "mac_ft": 4.9,

    # ---- lift (wing + body, flaps up). Angles in degrees, body axis.
    "CL0": 0.27,            # lift coefficient at zero angle of attack
    "CLa_per_deg": 0.0908,  # lift-curve slope in the linear range (5.2 per radian)
    "alpha_lin": 10.0,      # end of the linear range
    "alpha_stall": 16.5,    # angle of attack at maximum lift, flaps up
    "CLmax": 1.58,          # maximum lift coefficient of wing + body, flaps up (before the tail's download)
    # lift lost beyond the stall angle: (degrees past the stall, drop in CL)
    "post_stall_drop": [[1.0, 0.03], [1.5, 0.08], [2.5, 0.20], [3.5, 0.32], [5.5, 0.50], [8.5, 0.68], [13.5, 0.86]],
    # Stall hysteresis: once the angle of attack has gone past "hyst_alpha_on" the flow stays separated (lift stays
    # low, drag high, no leading-edge suction) until the angle of attack has been brought back below "hyst_alpha_off".
    "hyst_alpha_on": 26.0,
    "hyst_alpha_off": 12.0,
    "reattach_alpha_lo": 9.0,   # on the stalled branch the flow is attached below this angle ...
    "reattach_alpha_hi": 14.0,  # ... and fully separated above this one
    "CN90": 1.60,           # normal-force coefficient of the fully stalled aircraft broadside-on (alpha = 90 deg)
    "alpha_neg_stall": -13.0,
    "CLmin": -0.95,
    # ---- flaps 0 / 10 / 20 / 30 degrees
    "flap_dCL": [0.0, 0.22, 0.42, 0.56],       # extra lift at the same angle of attack
    "flap_dAlphaStall": [0.0, -0.5, -1.2, -2.0],  # the flapped wing stalls at a lower angle
    "flap_dCLmax": [0.0, 0.15, 0.25, 0.31],    # extra maximum lift
    "flap_dCD0": [0.0, 0.010, 0.027, 0.048],   # extra profile drag
    "flap_K_factor": [1.0, 1.06, 1.12, 1.18],  # less efficient spanwise loading with flaps down
    "flap_dCm": [0.0, -0.02, -0.045, -0.065],      # pitching-moment change at the same angle of attack (see CHANGES.md)

    # ---- drag
    "CD0": 0.0294,          # zero-lift drag coefficient, flaps up
    "K": 0.0620,            # induced drag factor: CDi = K * CL^2  (Oswald efficiency about 0.73)
    "CD_elev": 0.02,
    # ---- pitching moment
    "Cm0": 0.02,
    "Cma_per_rad": -0.90,   # about the aerodynamic reference point (neutral point near 45 % chord)
    "Cm_stall_break": -0.14,  # extra nose-down moment once the wing has stalled
    "Cm_high_alpha": [[22, -0.56], [25, -0.68], [29, -0.70], [35, -0.60], [45, -0.62], [90, -0.80]],  # deep-stall pitching moment (angle, Cm)
    "Cm_hyst": 0.11,        # nose-up shift while the wing stays fully stalled (the tail works in the wing's wake)
    "Cmq": -12.4,
    "Cmadot": -7.27,
    "Cmde": -1.122,
    "elevator_fade": [[22, 1.0], [35, 0.85], [45, 0.6], [60, 0.4], [90, 0.3]],  # share of elevator power left at high alpha
    "elev_full_aft_eff_deg": 26.0,  # what the full 28 degrees of up-elevator is worth for pitching moment
    "CLde": 0.43,
    "CLq": 3.9,
    "CLadot": 1.7,
    "tail_slipstream_share": 0.5,  # share of the tail's dynamic pressure that comes from the propeller slipstream

    # ---- four-panel wing model for roll (replaces the constant roll-damping / dihedral / roll-due-to-yaw terms).
    # Each half-wing is two panels of equal area (a quarter of the wing each). Their spanwise positions are
    # chosen so that roll damping in normal flight equals the textbook value (Clp = -0.484) with the outer
    # panel three times further out than the inner one.
    "panel_inner_frac": 0.0965,  # spanwise position of the inner panels, fraction of the span
    "panel_outer_frac": 0.2895,  # spanwise position of the outer panels
    # The outer wing has washout: it stalls later and more gently than the inner wing, so roll damping
    # survives a normal stall; it is lost (the wing "autorotates") when an outer panel is pushed past its stall
    # by roll rate, yaw rate, sideslip, aileron or simply too much angle of attack.
    "panel_alpha_stall": 24.0,
    "panel_alpha_lin": 13.0,
    "panel_CLmax": 1.80,
    "panel_post_stall_drop": [[1.0, 0.03], [2.0, 0.10], [3.5, 0.26], [5.0, 0.45], [7.0, 0.70], [9.0, 1.02]],
    "panel_CD0": 0.010,
    "dihedral_eff_rad": 0.105,   # effective dihedral (geometric dihedral + high-wing effect)
    "aileron_tau": 0.20,         # change of outer-panel angle of attack per radian of mean aileron deflection
    "Clr_fin": 0.02,
    "Cl_rudder": 0.0147,
    # ---- yaw
    "Cnb_per_rad": 0.0587,
    "Cnp": -0.010,             # fin part only; the wing part now comes from the four-panel model
    "Cnrr": -0.25,             # quadratic cross-flow yaw damping, times sin(alpha)
    "Cnr_fuselage": -0.005,    # extra yaw damping of the fuselage in cross-flow, times sin(alpha)
    "Cnr": -0.115,
    "Cnda": -0.012,
    "Cndr": -0.0657,
    "CYb_per_rad": -0.3926,
    "CYdr": 0.187,
    "fin_blanking": [[15, 1.0], [25, 0.85], [40, 0.75], [90, 0.5]],  # share of RUDDER power left at high alpha
    "fin_damping_blanking": [[15, 1.0], [25, 0.40], [35, 0.05], [90, 0.05]],  # share of the fin's weathercock stability and yaw damping left

    # ---- propeller and engine effects on the airframe
    "swirl_gain": 2.0,         # nose-left yawing moment per ft-lb of engine torque (spiralling slipstream on fin and rear fuselage)
    "swirl_arm_ft": 15.7,
    "p_factor": 40.0,
    # ---- rigging (fixed, like the ground-adjusted rudder tab and wing wash-in of a real aircraft)
    "rig_Cn": 0.001711,             # yawing-moment coefficient of the fixed rudder tab (nose right +), acts on the tail's dynamic pressure
    "rig_Cl": 0.000935,             # rolling-moment coefficient of the rigging (right wing down +)

    # ---- controls / gear
    "trim_authority": 0.4,
    "brake_mu": 0.29,
    "tyre_peak_mu": 0.8,

    # ---- engine (Lycoming O-320-D2J class: 320 cu in, 160 hp at 2700 rpm)
    "bsfc": 0.4173,
    "static_friction_hp": 1.5,
    "idle_rpm": 600.0,
    "min_map": 10.0,
    "max_map": 28.5,
    "spark_fail_drop": 0.11,
    "starter_torque": 64.0,
    "starter_rpm": 1100.0,
    # Power against mixture strength AT CONSTANT AIR FLOW: fuel/air ratio -> share of best power.
    # (Best power near 0.078-0.083; about 4 % less at peak exhaust temperature, 0.067; the engine
    # misfires and stops below about 0.05; very rich mixtures lose power more gently.)
    "power_vs_mixture": [[0.050, 0.0], [0.052, 0.30], [0.055, 0.62], [0.058, 0.78], [0.062, 0.89], [0.067, 0.955],
                         [0.072, 0.985], [0.078, 1.0], [0.083, 1.0], [0.0884, 0.992], [0.095, 0.97], [0.105, 0.92],
                         [0.115, 0.85], [0.125, 0.76], [0.14, 0.60], [0.16, 0.35], [0.18, 0.10], [0.20, 0.0]],
    # Share of the fuel's heat that reaches the exhaust against equivalence ratio (1 = chemically
    # correct mixture). Chosen so that the exhaust gas temperature peaks at the chemically correct
    # mixture and full rich at sea level is roughly 100 F cooler, as on the real engine.
    "combustion_table": [[0.0, 0.98], [0.9, 0.98], [1.0, 0.975], [1.05, 0.925], [1.1, 0.875], [1.2, 0.79], [1.3, 0.715],
                         [1.4, 0.65], [1.5, 0.60], [1.6, 0.555], [2.0, 0.40], [3.0, 0.25]],

    # ---- propeller (75 in fixed pitch): thrust and power coefficients vs advance ratio J = V / (n D)
    "prop_J":  [0.0,    0.1,    0.2,    0.3,    0.4,    0.5,    0.6,    0.7,    0.8,    0.9,    1.0,     1.1,     1.2,     1.4,     1.6,     2.0,     3.0,    5.0],
    "prop_Ct": [0.0950, 0.0940, 0.0915, 0.0870, 0.0798, 0.0701, 0.0635, 0.0535, 0.0355, 0.0160, -0.0040, -0.0240, -0.0450, -0.1000, -0.1400, -0.1700, -0.260, -0.640],
    "prop_Cp": [0.0573, 0.0576, 0.0574, 0.0566, 0.0551, 0.0528, 0.0500, 0.0462, 0.0390, 0.0270, 0.0130, 0.0020, -0.0080, -0.0360, -0.0750, -0.1700, -0.500, -1.200],
    "prop_ixx": 1.67,
}

ALPHA_GRID = [-180, -150, -120, -90, -60, -45, -30, -25, -20, -16, -13, -10, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
              14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 19, 20, 22, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 120, 150, 180]
PANEL_GRID = [-180, -150, -120, -90, -60, -45, -30, -25, -20, -16, -13, -10, -8, -4, 0, 4, 8, 12, 13, 14, 15, 16, 17, 18,
              19, 20, 21, 22, 23, 23.5, 24, 25, 26, 27.5, 29, 31, 33, 35, 40, 45, 50, 60, 70, 80, 90, 120, 150, 180]
PANEL_GRID_INNER = [-180, -150, -120, -90, -60, -45, -30, -25, -20, -16, -13, -10, -8, -4, 0, 4, 8, 10, 11, 12, 13, 14, 15, 15.5, 16, 16.5,
                    17, 17.5, 18, 19, 20, 22, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 120, 150, 180]
FLAPS = [0, 10, 20, 30]


def interp(pts, x):
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def cn_fp(P, a):
    """Normal-force coefficient of the fully stalled wing (empirical flat-plate curve, after Hoerner):
    CN = CN90 * sin(a) / (0.56 + 0.44 |sin(a)|). The force is perpendicular to the wing, so
    lift = CN cos(a) and drag = CN sin(a)."""
    sn = math.sin(math.radians(a))
    return P["CN90"] * sn / (0.56 + 0.44 * abs(sn))


def flat_plate_cl(P, a):
    return cn_fp(P, a) * math.cos(math.radians(a))


def cl_wb(P, a, fi):
    """Lift coefficient of wing + body at angle of attack a (deg) for flap index fi."""
    slope = P["CLa_per_deg"]
    dcl = P["flap_dCL"][fi]
    a_lin = P["alpha_lin"] + P["flap_dAlphaStall"][fi]
    a_s = P["alpha_stall"] + P["flap_dAlphaStall"][fi]
    clmax = P["CLmax"] + P["flap_dCLmax"][fi]
    cl0 = P["CL0"] + dcl
    a_ns = P["alpha_neg_stall"]
    a_nlin = a_ns + 5.0
    if a_nlin <= a <= a_lin:
        return cl0 + slope * a
    if a_lin < a <= a_s:
        # cubic Hermite from the end of the linear range (slope kept) to the peak (slope zero)
        d = a_s - a_lin
        t = (a - a_lin) / d
        p0 = cl0 + slope * a_lin
        h00 = 2 * t**3 - 3 * t**2 + 1
        h10 = t**3 - 2 * t**2 + t
        h01 = -2 * t**3 + 3 * t**2
        return h00 * p0 + h10 * slope * d + h01 * clmax
    if a > a_s:
        # post-stall: drop from the peak, then merge into the flat-plate curve by 30 degrees
        drop = [[0.0, 0.0]] + P["post_stall_drop"]
        x = a - a_s
        last_x = drop[-1][0]
        if x <= last_x:
            return clmax - interp(drop, x)
        a_end = a_s + last_x
        cl_end = clmax - drop[-1][1]
        if a < 30:
            fp30 = flat_plate_cl(P, 30) + 0.25 * P["flap_dCLmax"][fi]
            return cl_end + (fp30 - cl_end) * (a - a_end) / (30 - a_end)
        fade = max(0.0, 1 - (a - 30) / 10.0) * 0.25 * P["flap_dCLmax"][fi]
        return flat_plate_cl(P, a) + fade
    # negative side
    clmin = P["CLmin"] + 0.5 * dcl
    p_lin = cl0 + slope * a_nlin
    if a >= a_ns:
        t = (a_nlin - a) / (a_nlin - a_ns)
        return p_lin + (clmin - p_lin) * (1 - (1 - t) ** 2)
    pts = [(-30.0, flat_plate_cl(P, -30)), (-20.0, clmin + 0.23), (-16.0, clmin + 0.13), (a_ns, clmin)]
    if a >= -30:
        return interp(pts, a)
    return flat_plate_cl(P, a)


def sep(P, a, fi=0):
    """0 = attached flow, 1 = fully separated."""
    a_s = P["alpha_stall"] + P["flap_dAlphaStall"][fi]
    if a >= 0:
        return min(1.0, max(0.0, (a - (a_s - 3.0)) / 11.0))
    return min(1.0, max(0.0, (-a - (-P["alpha_neg_stall"] - 3.0)) / 11.0))


def cd_sep(P, a, fi=0, cl=None):
    """Extra drag of separated flow: brings the total up to the flat-plate value CN sin(a) once fully stalled."""
    if cl is None:
        cl = cl_wb(P, a, fi)
    sn = math.sin(math.radians(a))
    full = max(0.0, abs(cn_fp(P, a) * sn) - P["K"] * cl * cl)
    return sep(P, a, fi) * full


def stalled_blend(P, a):
    """How far the flow stays separated once the wing has fully stalled (0 below the re-attachment angle, 1 above)."""
    lo, hi = P["reattach_alpha_lo"], P["reattach_alpha_hi"]
    x = abs(a) if a >= 0 else abs(a) * (P["alpha_stall"] / -P["alpha_neg_stall"])
    return min(1.0, max(0.0, (x - lo) / (hi - lo)))


def cl_stalled(P, a, cl_attached):
    """Lift coefficient on the stalled branch: flat-plate lift above the re-attachment range, never more than the attached value."""
    w = stalled_blend(P, a)
    fp = flat_plate_cl(P, a)
    if a >= 0:
        return min(cl_attached, (1 - w) * cl_attached + w * fp)
    return max(cl_attached, (1 - w) * cl_attached + w * fp)


def cd_stalled_extra(P, a, cl_stalled_value):
    """Separation drag on the stalled branch (total drag = CD0 + K CL^2 + this = flat-plate drag when fully separated)."""
    w = stalled_blend(P, a)
    sn = math.sin(math.radians(a))
    return w * max(0.0, abs(cn_fp(P, a) * sn) - P["K"] * cl_stalled_value ** 2)


def panel_curves(P, a, outer, stalled=False):
    """(CN, CA) of one wing panel at angle of attack a (deg): force coefficients perpendicular to and along the wing chord
    (CA positive = pulling backwards). A wing in attached flow pulls FORWARD along the chord at high lift (leading-edge
    suction); a stalled wing does not - that difference yaws the aircraft toward a stalled wing."""
    if outer:
        Q = dict(P)
        Q["alpha_stall"] = P["panel_alpha_stall"]
        Q["alpha_lin"] = P["panel_alpha_lin"]
        Q["CLmax"] = P["panel_CLmax"]
        Q["post_stall_drop"] = P["panel_post_stall_drop"]
    else:
        Q = P
    cl = cl_wb(Q, a, 0)
    cd = P["panel_CD0"] + P["K"] * cl * cl + cd_sep(Q, a, 0, cl)
    if stalled:
        cls = cl_stalled(P, a, cl)
        cd = max(cd, P["panel_CD0"] + P["K"] * cls * cls + cd_stalled_extra(P, a, cls))
        cl = cls
    ar = math.radians(a)
    return cl * math.cos(ar) + cd * math.sin(ar), cd * math.cos(ar) - cl * math.sin(ar)


def cd_induced(P, a, fi):
    return P["K"] * P["flap_K_factor"][fi] * cl_wb(P, a, fi) ** 2


def cm_alpha(P, a, fi=0):
    """Pitching moment due to angle of attack over the whole range (restoring everywhere, zero at +-180).

    Linear in normal flight. At the stall the wing's downwash on the tailplane collapses and the centre of
    lift moves aft, which adds a strong nose-down moment ("the break"): the elevator cannot hold the nose up.
    """
    k = P["Cma_per_rad"]
    lin = k * math.radians(a)
    a_s = P["alpha_stall"] + P["flap_dAlphaStall"][fi]
    if -10 <= a <= a_s - 2.5:
        return lin
    if a > 0:
        br = P["Cm_stall_break"]
        pts = [(a_s - 2.5, k * math.radians(a_s - 2.5)), (a_s, k * math.radians(a_s) + 0.15 * br), (a_s + 1.5, k * math.radians(a_s + 1.5) + 0.6 * br),
               (a_s + 3.5, k * math.radians(a_s + 3.5) + br)] + [(x, y) for x, y in P["Cm_high_alpha"] if x > a_s + 3.5] + [(135, -0.60), (180, 0.0)]
        return interp(pts, a)
    pts = [(-180, 0.0), (-135, 0.6), (-90, 0.95), (-45, 0.70), (-30, 0.55), (-20, 0.40), (-10, k * math.radians(-10))]
    return interp(pts, a)


def side_curve(slope_per_rad, v45, v90):
    """Odd curve vs sideslip (deg): linear to 20 deg, then given values at 45 and 90 deg."""
    v20 = slope_per_rad * math.radians(20)
    return [(-90, -v90), (-45, -v45), (-20, -v20), (0, 0.0), (20, v20), (45, v45), (90, v90)]


# --------------------------------------------------------------------------------------------
# XML helpers
# --------------------------------------------------------------------------------------------
def f(x, nd=4):
    s = f"{x:.{nd}f}"
    return s if float(s) != 0 else f"{0:.{nd}f}"


def table1(var, rows, indent, nd=4, xnd=4):
    pad = " " * indent
    out = [f"{pad}<table>", f"{pad}    <independentVar>{var}</independentVar>", f"{pad}    <tableData>"]
    for x, y in rows:
        out.append(f"{pad}        {f(x, xnd):>9}  {f(y, nd):>9}")
    out += [f"{pad}    </tableData>", f"{pad}</table>"]
    return "\n".join(out)


def table2(rowvar, colvar, cols, rows, indent, nd=4):
    pad = " " * indent
    out = [f"{pad}<table>", f"{pad}    <independentVar lookup=\"row\">{rowvar}</independentVar>",
           f"{pad}    <independentVar lookup=\"column\">{colvar}</independentVar>", f"{pad}    <tableData>"]
    out.append(f"{pad}                   " + "  ".join(f"{f(c, 1):>9}" for c in cols))
    for x, ys in rows:
        out.append(f"{pad}        {f(x, 4):>9}  " + "  ".join(f"{f(y, nd):>9}" for y in ys))
    out += [f"{pad}    </tableData>", f"{pad}</table>"]
    return "\n".join(out)


def fn(name, desc, body, indent=8):
    pad = " " * indent
    return f"{pad}<function name=\"{name}\">\n{pad}    <description>{desc}</description>\n{body}\n{pad}</function>"


def product(items, indent):
    pad = " " * indent
    inner = "\n".join(items)
    return f"{pad}<product>\n{inner}\n{pad}</product>"


def prop(name, indent):
    return " " * indent + f"<property>{name}</property>"


def val(v, indent, nd=4):
    return " " * indent + f"<value>{f(v, nd)}</value>"


def rad(a):
    return math.radians(a)


# --------------------------------------------------------------------------------------------
# Aerodynamics section
# --------------------------------------------------------------------------------------------
def aerodynamics(P):
    b = P["span_ft"]
    QS = [prop("aero/qbar-psf", 20), prop("metrics/Sw-sqft", 20)]
    QSb = QS + [prop("metrics/bw-ft", 20)]
    QSc = QS + [prop("metrics/cbarw-ft", 20)]
    QtS = [prop("aero/function/qbar-tail-psf", 20), prop("metrics/Sw-sqft", 20)]
    out = []
    A = out.append

    A("    <aerodynamics>")
    A("""
        <!-- TeachX: this whole section is generated by flightsim/jsbsim/tools/gen_model.py.
             It keeps the structure and most stability derivatives of JSBSim's c172p (which are
             textbook values for this aircraft type) and changes what is listed in CHANGES.md:
             lift, drag and pitching moment cover every angle of attack; roll comes from a
             four-panel wing so that a stalled wing drops and can autorotate; propeller slipstream,
             rigging and fin blanking are added. -->

        <alphalimits unit="RAD">
            <min>-0.087</min>
            <max>%s</max>
        </alphalimits>

        <!-- TeachX: aero/stall-hyst-norm becomes 1 above the upper angle and returns to 0 below the lower one -->
        <hysteresis_limits unit="RAD">
            <min>%s</min>
            <max>%s</max>
        </hysteresis_limits>
""" % (f(rad(P["alpha_stall"]), 3), f(rad(P["hyst_alpha_off"]), 4), f(rad(P["hyst_alpha_on"]), 4)))

    # ---- ground effect (unchanged from JSBSim's c172p)
    A(fn("aero/function/kCDge", "Change_in_drag_due_to_ground_effect", table1("aero/h_b-mac-ft", [
        (0.0, 0.48), (0.1, 0.515), (0.15, 0.629), (0.2, 0.709), (0.3, 0.815), (0.4, 0.882), (0.5, 0.928), (0.6, 0.962),
        (0.7, 0.988), (0.8, 1.0), (0.9, 1.0), (1.0, 1.0), (1.1, 1.0)], 12)))
    A(fn("aero/function/kCLge", "Change_in_lift_due_to_ground_effect", table1("aero/h_b-mac-ft", [
        (0.0, 1.203), (0.1, 1.127), (0.15, 1.09), (0.2, 1.073), (0.3, 1.046), (0.4, 1.055), (0.5, 1.019), (0.6, 1.013),
        (0.7, 1.008), (0.8, 1.006), (0.9, 1.003), (1.0, 1.002), (1.1, 1.0)], 12)))

    # ---- slipstream helpers
    A(fn("aero/function/velocity-induced-fps", "velocity including the propulsion induced velocity.", """            <sum>
                <property>velocities/u-aero-fps</property>
                <property>propulsion/engine/prop-induced-velocity_fps</property>
                <property>propulsion/engine/prop-induced-velocity_fps</property>
            </sum>"""))
    A(fn("aero/function/qbar-induced-psf", "q bar including the propulsion induced velocity.", """            <product>
                <property>aero/function/velocity-induced-fps</property>
                <property>aero/function/velocity-induced-fps</property>
                <property>atmosphere/rho-slugs_ft3</property>
                <value>0.5</value>
            </product>"""))
    sh = P["tail_slipstream_share"]
    A(fn("aero/function/tail-slipstream-share",
         "TeachX: share of the tail that feels the propeller slipstream. At high angle of attack the slipstream passes above the tail.",
         table1("aero/alpha-rad", [(rad(-90), 0.0), (rad(-20), 0.0), (rad(-8), sh), (rad(10), sh), (rad(20), 0.0), (rad(90), 0.0)], 12)))
    A(fn("aero/function/qbar-tail-psf",
         "TeachX: dynamic pressure at the tail. Only part of the tail sits in the propeller slipstream, so blend free stream and slipstream.",
         """            <sum>
                <property>aero/qbar-psf</property>
                <product>
                    <property>aero/function/tail-slipstream-share</property>
                    <difference>
                        <property>aero/function/qbar-induced-psf</property>
                        <property>aero/qbar-psf</property>
                    </difference>
                </product>
            </sum>"""))
    A(fn("aero/function/engine-torque-ftlb",
         "TeachX: engine torque on the propeller shaft (power / shaft speed), kept finite when the propeller is nearly stopped.",
         """            <quotient>
                <product>
                    <property>propulsion/engine/power-hp</property>
                    <value>5252.0</value>
                </product>
                <max>
                    <property>propulsion/engine/engine-rpm</property>
                    <value>600.0</value>
                </max>
            </quotient>"""))
    A(fn("aero/function/slipstream-immersion",
         "TeachX: how much of the fin sits inside the propeller slipstream (0.1 to 1). The slipstream narrows most when the aircraft "
         "is standing still at high power (radius ratio = sqrt((V+w)/(V+2w)), w = induced velocity), and the fin root is about 0.68 "
         "propeller radii above the thrust line, so the fin is hardly touched at the start of the take-off roll and well inside by climb speed.",
         """            <max>
                <value>0.1</value>
                <min>
                    <value>1.0</value>
                    <quotient>
                        <difference>
                            <pow>
                                <quotient>
                                    <max>
                                        <sum>
                                            <property>velocities/u-aero-fps</property>
                                            <property>propulsion/engine/prop-induced-velocity_fps</property>
                                        </sum>
                                        <value>0.5</value>
                                    </max>
                                    <max>
                                        <sum>
                                            <property>velocities/u-aero-fps</property>
                                            <property>propulsion/engine/prop-induced-velocity_fps</property>
                                            <property>propulsion/engine/prop-induced-velocity_fps</property>
                                        </sum>
                                        <value>1.0</value>
                                    </max>
                                </quotient>
                                <value>0.5</value>
                            </pow>
                            <value>0.68</value>
                        </difference>
                        <value>0.32</value>
                    </quotient>
                </min>
            </max>"""))
    A(fn("aero/function/elevator-effective-rad",
         "TeachX: elevator deflection that counts for pitching moment. Linear to 15 degrees; the last part of the travel does a little less "
         "(a strongly deflected elevator loses effectiveness).",
         table1("fcs/elevator-pos-rad", [(rad(-28), rad(-P["elev_full_aft_eff_deg"])), (rad(-15), rad(-15)), (0, 0), (rad(15), rad(15)), (rad(23), rad(20.5))], 12)))
    A(fn("aero/function/krig",
         "TeachX: the rigging (wing wash-in, rudder tab) works in attached flow; it fades out as the wing stalls.",
         table1("aero/alpha-rad", [(rad(-30), 0.0), (rad(-15), 1.0), (rad(16), 1.0), (rad(26), 0.0)], 12)))
    A(fn("aero/function/kelevator",
         "TeachX: share of elevator power left at high angle of attack (the tailplane itself stalls when the air meets it at a steep angle)",
         table1("aero/alpha-rad", [(rad(-180), 0.3), (rad(-60), 0.35), (rad(-25), 1.0)] + [(rad(a), k) for a, k in P["elevator_fade"]] + [(rad(180), 0.3)], 12)))
    A(fn("aero/function/kfin",
         "TeachX: share of fin and rudder effectiveness left at high angle of attack (the stalled wing and the tailplane blank the fin).",
         table1("aero/alpha-rad", [(rad(-180), 0.5), (rad(-90), 0.5), (rad(-30), 1.0)] + [(rad(a), k) for a, k in P["fin_blanking"]] + [(rad(180), 0.5)], 12)))
    A(fn("aero/function/kfin-damping",
         "TeachX: share of the fin's weathercock stability and yaw damping left at high angle of attack (the fin sits in the wake of the stalled wing and tailplane; "
         "the rudder, lower and further aft, keeps more of its power).",
         table1("aero/alpha-rad", [(rad(-180), 0.3), (rad(-90), 0.3), (rad(-30), 1.0)] + [(rad(a), k) for a, k in P["fin_damping_blanking"]] + [(rad(180), 0.3)], 12)))

    # ---- four-panel wing
    A(fn("aero/function/aileron-mean-rad",
         "TeachX: mean aileron deflection, positive = roll right (left aileron down, right aileron up).",
         """            <product>
                <value>0.5</value>
                <difference>
                    <property>fcs/left-aileron-pos-rad</property>
                    <property>fcs/right-aileron-pos-rad</property>
                </difference>
            </product>"""))
    A(fn("aero/function/v-safe-fps", "TeachX: true airspeed, never below 30 ft/s (keeps the ratios below finite).",
         """            <max>
                <property>velocities/vt-fps</property>
                <value>30.0</value>
            </max>"""))
    A(fn("aero/function/panel-dihedral-rad",
         "TeachX: sideslip raises the angle of attack of the windward wing (dihedral and high-wing effect); this is the change for the RIGHT wing.",
         f"""            <product>
                <value>{f(P['dihedral_eff_rad'], 4)}</value>
                <sin><property>aero/beta-rad</property></sin>
            </product>"""))
    panels = (("inner", P["panel_inner_frac"] * b, False), ("outer", P["panel_outer_frac"] * b, True))
    def ptab(outer, grid, idx):
        return [(rad(a), [panel_curves(P, a, outer, False)[idx], panel_curves(P, a, outer, True)[idx]]) for a in grid]
    tables = {
        "inner": (ptab(False, PANEL_GRID_INNER, 0), ptab(False, PANEL_GRID_INNER, 1)),
        "outer": (ptab(True, PANEL_GRID, 0), ptab(True, PANEL_GRID, 1)),
    }
    for name, y, has_aileron in panels:
        ail = f"""
                <product>
                    <value>{f(-P['aileron_tau'], 4)}</value>
                    <property>aero/function/aileron-mean-rad</property>
                </product>""" if has_aileron else ""
        A(fn(f"aero/function/{name}-dalpha-rad",
             f"TeachX: how much rolling, sideslip{' and aileron' if has_aileron else ''} change the angle of attack of the RIGHT {name} wing panel "
             f"({f(y, 2)} ft from the centreline); the left panel gets the opposite.",
             f"""            <sum>
                <atan2>
                    <product>
                        <property>velocities/p-aero-rad_sec</property>
                        <value>{f(y, 3)}</value>
                    </product>
                    <property>aero/function/v-safe-fps</property>
                </atan2>
                <property>aero/function/panel-dihedral-rad</property>{ail}
            </sum>"""))
        A(fn(f"aero/function/{name}-dv",
             f"TeachX: yawing makes the left {name} panel faster and the right one slower by this fraction of the airspeed.",
             f"""            <max>
                <value>-0.6</value>
                <min>
                    <value>0.6</value>
                    <quotient>
                        <product>
                            <property>velocities/r-aero-rad_sec</property>
                            <value>{f(y, 3)}</value>
                        </product>
                        <property>aero/function/v-safe-fps</property>
                    </quotient>
                </min>
            </max>"""))
        for side, op in (("right", "sum"), ("left", "difference")):
            A(fn(f"aero/function/alpha-{name}-{side}-rad", f"TeachX: angle of attack of the {side} {name} wing panel.",
                 f"""            <{op}>
                <property>aero/alpha-rad</property>
                <property>aero/function/{name}-dalpha-rad</property>
            </{op}>"""))
        for side, sgn in (("right", "difference"), ("left", "sum")):
            qexpr = f"""                <pow>
                    <{sgn}>
                        <value>1.0</value>
                        <property>aero/function/{name}-dv</property>
                    </{sgn}>
                    <value>2.0</value>
                </pow>"""
            A(fn(f"aero/function/normal-{name}-{side}",
                 f"TeachX: force coefficient perpendicular to the chord of the {side} {name} wing panel, times its dynamic-pressure ratio.",
                 "            <product>\n" + qexpr + "\n" + table2(f"aero/function/alpha-{name}-{side}-rad", "aero/stall-hyst-norm", [0, 1], tables[name][0], 16) + "\n            </product>"))
            A(fn(f"aero/function/axial-{name}-{side}",
                 f"TeachX: force coefficient along the chord (positive = backwards) of the {side} {name} wing panel, times its dynamic-pressure ratio.",
                 "            <product>\n" + qexpr + "\n" + table2(f"aero/function/alpha-{name}-{side}-rad", "aero/stall-hyst-norm", [0, 1], tables[name][1], 16) + "\n            </product>"))
    clean_sep = [(rad(a), cd_sep(P, a, 0)) for a in ALPHA_GRID]

    # =========================================================== DRAG
    A('\n        <axis name="DRAG">')
    A(fn("aero/coefficient/CDo", "Drag_at_zero_lift", product(QS + [val(P["CD0"], 20)], 16), 12))
    A(fn("aero/coefficient/CDDf", "Delta_drag_due_to_flap_deflection (profile drag)",
         product(QS + [table1("fcs/flap-pos-deg", list(zip(FLAPS, P["flap_dCD0"])), 20)], 16), 12))
    rows = [(rad(a), [cd_induced(P, a, fi) for fi in range(4)]) for a in ALPHA_GRID]
    A(fn("aero/coefficient/CDwbh", "Drag_due_to_lift (induced drag = K x CL^2, reduced close to the ground)",
         product(QS + [prop("aero/function/kCDge", 20), table2("aero/alpha-rad", "fcs/flap-pos-deg", FLAPS, rows, 20)], 16), 12))
    A(fn("aero/coefficient/CDsep", "TeachX: drag of separated flow beyond the stall (rises to a flat plate broadside-on)",
         product(QS + [table1("aero/alpha-rad", clean_sep, 20)], 16), 12))
    A(fn("aero/coefficient/CDhyst", "TeachX: extra drag while the wing stays stalled (stall hysteresis)",
         product(QS + [prop("aero/stall-hyst-norm", 20), table1("aero/alpha-rad", [(rad(a), max(0.0, (P["K"] * cl_stalled(P, a, cl_wb(P, a, 0)) ** 2 + cd_stalled_extra(P, a, cl_stalled(P, a, cl_wb(P, a, 0)))) - (P["K"] * cl_wb(P, a, 0) ** 2 + cd_sep(P, a, 0)))) for a in ALPHA_GRID], 20)], 16), 12))
    A(fn("aero/coefficient/CDDe", "Drag_due_to_Elevator_Deflection",
         product(QS + [prop("fcs/mag-elevator-pos-rad", 20), val(P["CD_elev"], 20)], 16), 12))
    A(fn("aero/coefficient/CDbeta", "Drag_due_to_sideslip (TeachX: grows with the square of the sideslip, table to 90 degrees)",
         product(QS + [table1("aero/mag-beta-rad", [(0, 0), (rad(2.5), 0.0008), (rad(5), 0.003), (rad(10), 0.012), (rad(15), 0.027),
                                                     (rad(20), 0.048), (rad(30), 0.105), (rad(45), 0.25), (rad(90), 0.60)], 20)], 16), 12))
    A("        </axis>")

    # =========================================================== SIDE
    A('\n        <axis name="SIDE">')
    cy = side_curve(P["CYb_per_rad"], -0.36, -0.60)
    rows = [(rad(bb), [v, v * 0.774]) for bb, v in cy]
    A(fn("aero/coefficient/CYb", "Side_force_due_to_beta (TeachX: extended to 90 degrees of sideslip)",
         product(QS + [table2("aero/beta-rad", "fcs/flap-pos-deg", [0, 30], rows, 20)], 16), 12))
    A(fn("aero/coefficient/CYdr", "Side_force_due_to_rudder",
         product(QtS + [prop("aero/function/kfin", 20), prop("fcs/rudder-pos-rad", 20), val(P["CYdr"], 20)], 16), 12))
    A(fn("aero/coefficient/CYp", "Side_force_due_to_roll_rate",
         product(QS + [prop("aero/bi2vel", 20), prop("velocities/p-aero-rad_sec", 20),
                       table2("aero/alpha-rad", "fcs/flap-pos-deg", [0, 30], [(0.0, [-0.075, -0.161]), (0.094, [-0.145, -0.231])], 20)], 16), 12))
    A(fn("aero/coefficient/CYr", "Side_force_due_to_yaw_rate",
         product(QS + [prop("aero/bi2vel", 20), prop("velocities/r-aero-rad_sec", 20),
                       table2("aero/alpha-rad", "fcs/flap-pos-deg", [0, 30], [(0.0, [0.214, 0.162]), (0.094, [0.267, 0.215])], 20)], 16), 12))
    A(fn("aero/coefficient/CYswirl",
         "TeachX: the spiralling propeller slipstream pushes the fin to the right (this is the side force that goes with the nose-left yawing moment Cnswirl)",
         product([prop("aero/function/engine-torque-ftlb", 20), prop("aero/function/slipstream-immersion", 20), val(P["swirl_gain"] / P["swirl_arm_ft"], 20, 5)], 16), 12))
    A(fn("aero/coefficient/CYrig", "TeachX: side force of the fixed rudder tab (goes with Cnrig)",
         product(QtS + [prop("aero/function/krig", 20), val(-P["rig_Cn"] * b / P["swirl_arm_ft"], 20, 6)], 16), 12))
    A("        </axis>")

    # =========================================================== LIFT
    A('\n        <axis name="LIFT">')
    rows = [(rad(a), [cl_wb(P, a, fi) for fi in range(4)]) for a in ALPHA_GRID]
    A(fn("aero/coefficient/CLwbh", "Lift_due_to_alpha (TeachX: all angles of attack, flaps included, clear stall break)",
         product(QS + [prop("aero/function/kCLge", 20), table2("aero/alpha-rad", "fcs/flap-pos-deg", FLAPS, rows, 20)], 16), 12))
    hyst_rows = []
    for a in ALPHA_GRID:
        cl = cl_wb(P, a, 0)
        cls = cl_stalled(P, a, cl)
        dcd = (P["K"] * cls * cls + cd_stalled_extra(P, a, cls)) - (P["K"] * cl * cl + cd_sep(P, a, 0, cl))
        hyst_rows.append((a, cls - cl, max(0.0, dcd)))
    A(fn("aero/coefficient/CLhyst",
         "TeachX: lift lost while the wing stays stalled (stall hysteresis): after a full stall the lift does not come back until the angle of attack is well below the stall angle",
         product(QS + [prop("aero/stall-hyst-norm", 20), table1("aero/alpha-rad", [(rad(a), d) for a, d, _ in hyst_rows], 20)], 16), 12))
    A(fn("aero/coefficient/CLDe", "Lift_due_to_Elevator_Deflection",
         product(QS + [prop("fcs/elevator-pos-rad", 20), val(P["CLde"], 20)], 16), 12))
    A(fn("aero/coefficient/CLadot", "Lift_due_to_alpha_rate",
         product(QS + [prop("aero/alphadot-rad_sec", 20), prop("aero/ci2vel", 20), val(P["CLadot"], 20)], 16), 12))
    A(fn("aero/coefficient/CLq", "Lift_due_to_pitch_rate",
         product(QS + [prop("velocities/q-aero-rad_sec", 20), prop("aero/ci2vel", 20), val(P["CLq"], 20)], 16), 12))
    A("        </axis>")

    # =========================================================== ROLL
    A('\n        <axis name="ROLL">')
    A(fn("aero/coefficient/Clwing",
         "TeachX: rolling moment of the four wing panels (left normal force minus right normal force, times each panel's arm). Gives roll damping, dihedral "
         "effect, roll due to yaw rate and aileron power in normal flight, and a dropping / autorotating wing beyond the stall.",
         product(QSb + [f"""                    <sum>
                        <product>
                            <value>{f(P['panel_inner_frac'] / 4.0, 5)}</value>
                            <difference>
                                <property>aero/function/normal-inner-left</property>
                                <property>aero/function/normal-inner-right</property>
                            </difference>
                        </product>
                        <product>
                            <value>{f(P['panel_outer_frac'] / 4.0, 5)}</value>
                            <difference>
                                <property>aero/function/normal-outer-left</property>
                                <property>aero/function/normal-outer-right</property>
                            </difference>
                        </product>
                    </sum>"""], 16), 12))
    A(fn("aero/coefficient/Clr", "Roll_moment_due_to_yaw_rate (fin part; the wing part is in Clwing)",
         product(QSb + [prop("aero/bi2vel", 20), prop("velocities/r-aero-rad_sec", 20), val(P["Clr_fin"], 20)], 16), 12))
    A(fn("aero/coefficient/Cldr", "Roll_moment_due_to_rudder",
         product(QSb + [prop("fcs/rudder-pos-rad", 20), val(P["Cl_rudder"], 20)], 16), 12))
    A(fn("aero/coefficient/Clrig", "TeachX: fixed rigging (wing wash-in) that balances engine torque in cruise",
         product(QSb + [prop("aero/function/krig", 20), val(P["rig_Cl"], 20, 6)], 16), 12))
    A("        </axis>")

    # =========================================================== PITCH
    A('\n        <axis name="PITCH">')
    A(fn("aero/coefficient/Cmo", "Pitching_moment_at_zero_alpha", product(QSc + [val(P["Cm0"], 20)], 16), 12))
    A(fn("aero/coefficient/Cmalpha", "Pitch_moment_due_to_alpha (TeachX: all angles of attack, extra nose-down break at the stall)",
         product(QSc + [table2("aero/alpha-rad", "fcs/flap-pos-deg", FLAPS, [(rad(a), [cm_alpha(P, a, fi) for fi in range(4)]) for a in ALPHA_GRID], 20)], 16), 12))
    A(fn("aero/coefficient/Cmhyst",
         "TeachX: pitching-moment shift while the wing stays fully stalled (stall hysteresis). Lets a developed spin hold its angle of attack; "
         "it disappears as soon as the angle of attack is reduced.",
         product(QSc + [prop("aero/stall-hyst-norm", 20),
                        table1("aero/alpha-rad", [(rad(-90), 0.0), (rad(28), 0.0), (rad(34), P["Cm_hyst"]), (rad(60), P["Cm_hyst"]), (rad(90), 0.0)], 20)], 16), 12))
    A(fn("aero/coefficient/Cmq", "Pitch_moment_due_to_pitch_rate",
         product(QSc + [prop("aero/ci2vel", 20), prop("velocities/q-aero-rad_sec", 20), val(P["Cmq"], 20)], 16), 12))
    A(fn("aero/coefficient/Cmadot", "Pitch_moment_due_to_alpha_rate",
         product(QSc + [prop("aero/ci2vel", 20), prop("aero/alphadot-rad_sec", 20), val(P["Cmadot"], 20)], 16), 12))
    A(fn("aero/coefficient/Cmde", "Pitch_moment_due_to_elevator_deflection (TeachX: tail dynamic pressure blends free stream and slipstream)",
         product([prop("aero/function/qbar-tail-psf", 20), prop("metrics/Sw-sqft", 20), prop("metrics/cbarw-ft", 20),
                  prop("aero/function/kelevator", 20), prop("aero/function/elevator-effective-rad", 20), val(P["Cmde"], 20)], 16), 12))
    A(fn("aero/coefficient/Cmdf", "Delta_pitching_moment_due_to_flap_deflection (TeachX: retuned, see CHANGES.md)",
         product(QSc + [table1("fcs/flap-pos-deg", list(zip(FLAPS, P["flap_dCm"])), 20)], 16), 12))
    A("        </axis>")

    # =========================================================== YAW
    A('\n        <axis name="YAW">')
    cn = side_curve(P["Cnb_per_rad"], 0.045, 0.075)
    A(fn("aero/coefficient/Cnb", "Yaw_moment_due_to_beta (TeachX: extended to 90 degrees of sideslip, fin blanking at high alpha)",
         product(QSb + [prop("aero/function/kfin-damping", 20), table1("aero/beta-rad", [(rad(x), y) for x, y in cn], 20)], 16), 12))
    A(fn("aero/coefficient/Cnp", "Yaw_moment_due_to_roll_rate",
         product(QSb + [prop("aero/bi2vel", 20), prop("velocities/p-aero-rad_sec", 20), val(P["Cnp"], 20)], 16), 12))
    A(fn("aero/coefficient/Cnr", "Yaw_moment_due_to_yaw_rate",
         product(QSb + [prop("aero/function/kfin-damping", 20), prop("aero/bi2vel", 20), prop("velocities/r-aero-rad_sec", 20), val(P["Cnr"], 20)], 16), 12))
    A(fn("aero/coefficient/Cnrfus", "TeachX: yaw damping of the fuselage in cross-flow at high angle of attack",
         product(QSb + [prop("aero/bi2vel", 20), prop("velocities/r-aero-rad_sec", 20),
                        table1("aero/alpha-rad", [(rad(a), P["Cnr_fuselage"] * abs(math.sin(rad(a)))) for a in (-180, -135, -90, -60, -30, 0, 30, 60, 90, 135, 180)], 20)], 16), 12))
    A(fn("aero/coefficient/Cnrr", "TeachX: cross-flow yaw damping that grows with the square of the yaw rate (matters only in spins)",
         product(QSb + [prop("aero/bi2vel", 20), prop("velocities/r-aero-rad_sec", 20),
                        """                    <abs>
                        <product>
                            <property>aero/bi2vel</property>
                            <property>velocities/r-aero-rad_sec</property>
                        </product>
                    </abs>""",
                        table1("aero/alpha-rad", [(rad(a), P["Cnrr"] * abs(math.sin(rad(a)))) for a in (-180, -135, -90, -60, -30, 0, 30, 60, 90, 135, 180)], 20)], 16), 12))
    A(fn("aero/coefficient/Cnda", "Yaw_moment_due_to_aileron (adverse yaw)",
         product(QSb + [prop("aero/function/aileron-mean-rad", 20), val(P["Cnda"], 20)], 16), 12))
    A(fn("aero/coefficient/Cndr", "Yaw_moment_due_to_rudder",
         product([prop("aero/function/qbar-tail-psf", 20), prop("metrics/Sw-sqft", 20), prop("metrics/bw-ft", 20),
                  prop("aero/function/kfin", 20), prop("fcs/rudder-pos-rad", 20), val(P["Cndr"], 20)], 16), 12))
    A(fn("aero/coefficient/Cnwing",
         "TeachX: yawing moment from unequal chordwise force of the left and right wing panels (yaw due to roll rate in normal flight; yaw toward a stalled wing)",
         product(QSb + [f"""                    <sum>
                        <product>
                            <value>{f(P['panel_inner_frac'] / 4.0, 5)}</value>
                            <difference>
                                <property>aero/function/axial-inner-right</property>
                                <property>aero/function/axial-inner-left</property>
                            </difference>
                        </product>
                        <product>
                            <value>{f(P['panel_outer_frac'] / 4.0, 5)}</value>
                            <difference>
                                <property>aero/function/axial-outer-right</property>
                                <property>aero/function/axial-outer-left</property>
                            </difference>
                        </product>
                    </sum>"""], 16), 12))
    A(fn("aero/coefficient/Cnswirl",
         "TeachX: spiralling propeller slipstream striking the left side of the fin and rear fuselage: nose-left yawing moment proportional to engine torque",
         product([prop("aero/function/engine-torque-ftlb", 20), prop("aero/function/slipstream-immersion", 20), val(-P["swirl_gain"], 20)], 16), 12))
    A(fn("aero/coefficient/Cnrig", "TeachX: fixed rudder tab that balances the slipstream in cruise",
         product(QtS + [prop("metrics/bw-ft", 20), prop("aero/function/krig", 20), val(P["rig_Cn"], 20, 6)], 16), 12))
    A("        </axis>")
    A("    </aerodynamics>")
    return "\n".join(out)


def cornering_table(P, indent=20):
    """JSBSim's built-in tyre side-force curve (Pacejka: stiffness 0.06, shape 2.8, curvature 1.03) with an explicit peak."""
    pad = " " * indent
    rows = []
    for slip in [-90, -60, -40, -30, -20, -15, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 60, 90]:
        ss = 0.06 * slip
        v = P["tyre_peak_mu"] * math.sin(2.8 * math.atan(ss - 1.03 * (ss - math.atan(ss))))
        rows.append(f"{pad}{slip:>6.1f}  {v:>8.4f}")
    return "\n".join(rows)


def aircraft_xml(P):
    t = open(os.path.join(HERE, "c172p.template.xml")).read()
    t = t.replace("@CORNERING@", cornering_table(P))
    t = t.replace("@BRAKE_MU@", f(P["brake_mu"], 2))
    t = t.replace("@P_FACTOR@", f(P["p_factor"], 1))
    t = t.replace("@TRIM_AUTHORITY@", f(P["trim_authority"], 3))
    a0 = t.index("    <!-- TEACHX-GENERATED-BEGIN aerodynamics -->")
    a1 = t.index("    <!-- TEACHX-GENERATED-END aerodynamics -->")
    t = t[:a0] + "    <!-- TEACHX-GENERATED-BEGIN aerodynamics -->\n" + aerodynamics(P) + "\n" + t[a1:]
    assert "@" not in t.replace("@endcode", ""), "unreplaced placeholder"
    return t


def engine_xml(P):
    # JSBSim computes indicated power = fuel flow x table value / bsfc, i.e. the table is "power per
    # unit of FUEL". Power really follows the AIR flow, so convert: value = power share x (rich ratio / ratio).
    x_rich = 0.0884  # fuel/air ratio at full rich, sea level (JSBSim: 1.3 / 14.7)
    g_rich = interp(P["power_vs_mixture"], x_rich)
    mix = "\n".join(f"      {x:.4f}  {g * x_rich / x / g_rich:.4f}" for x, g in P["power_vs_mixture"])
    comb = "\n".join(f"      {x:.2f}  {y:.3f}" for x, y in P["combustion_table"])
    return f"""<?xml version="1.0"?>
<!--
  File:     IO320.xml
  Author:   Ron Jensen

  Inputs:
    name:           IO320
    type:           piston
    power:          160.0 hp
    augmented?      no
    injected?       no

  MODIFIED FILE: this is JSBSim's engine/eng_io320.xml changed by the TeachX Flight Simulator
  project (2026). The original gave about 215 hp at 2700 rpm (its fuel-consumption figure made
  the engine too strong); this version gives the rated 160 hp at 2700 rpm at sea level and uses
  the real engine's bore and stroke. Every change is listed in flightsim/jsbsim/CHANGES.md.
  Generated by flightsim/jsbsim/tools/gen_model.py.
-->

<piston_engine name="IO320">
  <minmp unit="INHG">        {P['min_map']:.1f}  </minmp>
  <maxmp unit="INHG">        {P['max_map']:.1f}  </maxmp>
  <displacement unit="IN3"> 319.8  </displacement>
  <bore unit="IN">            5.125 </bore>
  <stroke unit="IN">          3.875 </stroke>
  <cylinders>                 4.0  </cylinders>
  <compression-ratio>         8.5  </compression-ratio>
  <maxhp>                   160.0  </maxhp>
  <bsfc>                      {P['bsfc']:.4f} </bsfc>
  <static-friction unit="HP"> {P['static_friction_hp']:.2f} </static-friction>
  <cycles>                    4.0  </cycles>
  <idlerpm>                 {P['idle_rpm']:.1f}  </idlerpm>
  <maxrpm>                 2700.0  </maxrpm>
  <maxthrottle>               1.0  </maxthrottle>
  <minthrottle>               0.1  </minthrottle>
  <sparkfaildrop>             {P['spark_fail_drop']:.3f} </sparkfaildrop>
  <starter-torque>           {P['starter_torque']:.1f} </starter-torque>
  <starter-rpm>            {P['starter_rpm']:.1f} </starter-rpm>

  <!-- Power per unit of fuel flow against fuel/air ratio (1.0 at full rich, sea level). Derived
       from "power at constant air flow": best power near 0.078-0.083, about 4 % less at peak
       exhaust temperature (0.067), misfire below about 0.05. Leaning therefore saves fuel and,
       at altitude where full rich is far too rich, gives power back. -->
  <table name="MIXTURE" type="internal">
    <tableData>
{mix}
    </tableData>
  </table>

  <!-- Share of the fuel's heat reaching the exhaust against equivalence ratio: makes the
       exhaust gas temperature peak at the chemically correct mixture. -->
  <table name="COMBUSTION" type="internal">
    <tableData>
{comb}
    </tableData>
  </table>
</piston_engine>
"""


def prop_xml(P):
    ct = "\n".join(f"      {j:.1f}   {v:.4f}" for j, v in zip(P["prop_J"], P["prop_Ct"]))
    cp = "\n".join(f"      {j:.1f}   {v:.4f}" for j, v in zip(P["prop_J"], P["prop_Cp"]))
    return f"""<?xml version="1.0"?>
<!--
  MODIFIED FILE: this is JSBSim's engine/prop_75in2f.xml changed by the TeachX Flight Simulator
  project (2026). The thrust and power tables were replaced so that, with the 160 hp engine, the
  aircraft matches Cessna 172P handbook-class numbers (static rpm, take-off roll, climb, cruise,
  maximum speed) and so that the propeller windmills and makes drag when the engine is idling or
  stopped (negative coefficients at high advance ratio). Every change is listed in
  flightsim/jsbsim/CHANGES.md. Generated by flightsim/jsbsim/tools/gen_model.py.
-->

<!-- version 1.1 selects JSBSim's corrected sign of the propeller's gyroscopic moment (TeachX change) -->
<propeller name="Fixed-Pitch 75-inch Two-Blade Propeller" version="1.1">
  <ixx> {P['prop_ixx']:.2f} </ixx>
  <diameter unit="IN"> 75.0 </diameter>
  <numblades> 2 </numblades>
  <minpitch> 22 </minpitch>
  <maxpitch> 22 </maxpitch>

  <!-- thrust coefficient against advance ratio J = V / (n D) -->
  <table name="C_THRUST" type="internal">
    <tableData>
{ct}
    </tableData>
  </table>

  <!-- power coefficient against advance ratio; negative = the airflow drives the propeller (windmilling) -->
  <table name="C_POWER" type="internal">
    <tableData>
{cp}
    </tableData>
  </table>

<!-- thrust effects of helical tip Mach -->
<table name="CT_MACH" type="internal">
  <tableData>
    0.85   1.0
    1.05   0.8
  </tableData>
</table>

<!-- power-required effects of helical tip Mach -->
<table name="CP_MACH" type="internal">
  <tableData>
    0.85   1.0
    1.05   1.8
    2.00   1.4
  </tableData>
</table>

</propeller>
"""


def main(argv):
    P = dict(PARAMS)
    out = os.path.dirname(HERE)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--out":
            out = argv[i + 1]
            i += 2
        elif a == "--set":
            i += 1
            while i < len(argv) and not argv[i].startswith("--"):
                k, v = argv[i].split("=", 1)
                if k not in P:
                    raise SystemExit(f"unknown parameter {k}")
                P[k] = json.loads(v)
                i += 1
        elif a == "--json":
            P.update(json.loads(argv[i + 1]))
            i += 2
        elif a == "--print":
            print(json.dumps(P, indent=1))
            return
        else:
            raise SystemExit(f"unknown argument {a}")
    os.makedirs(os.path.join(out, "aircraft", "c172p"), exist_ok=True)
    os.makedirs(os.path.join(out, "engine"), exist_ok=True)
    open(os.path.join(out, "aircraft", "c172p", "c172p.xml"), "w").write(aircraft_xml(P))
    open(os.path.join(out, "engine", "eng_io320.xml"), "w").write(engine_xml(P))
    open(os.path.join(out, "engine", "prop_75in2f.xml"), "w").write(prop_xml(P))


if __name__ == "__main__":
    main(sys.argv[1:])
