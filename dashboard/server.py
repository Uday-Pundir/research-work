"""
Activity Tracker — Flask Backend
Stores goals and activities in an Excel file (tracker_data.xlsx)
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
import os
import json
from datetime import datetime, date
import uuid

app = Flask(__name__, static_folder='.')
CORS(app)

DATA_FILE = os.path.join(os.path.dirname(__file__), 'tracker_data.xlsx')
PROFILE_FILE = os.path.join(os.path.dirname(__file__), 'profile.json')
GOALS_SHEET = 'Goals'
ACTIVITIES_SHEET = 'Activities'

DEFAULT_PROFILE = {
    'name': 'Uday Pundir',
    'title': 'Student & Aspiring Software Engineer',
    'university': 'Computer Science Department',
    'degree': 'B.Tech in Computer Science',
    'year': '3rd Year (Class of 2026)',
    'bio': 'Passionate about coding, algorithms, web development, and maintaining consistent daily habits to achieve personal and professional milestones.',
    'avatar': '👨‍💻',
    'github': 'https://github.com/udaypundir',
    'linkedin': 'https://www.linkedin.com/in/uday-pundir',
    'email': 'udaypundir.work@gmail.com',
    'portfolio': '',
    'twitter': '',
    'skills': 'Data Structures, Python, JavaScript, Web Development, Problem Solving'
}

def load_profile():
    if os.path.exists(PROFILE_FILE):
        try:
            with open(PROFILE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                res = DEFAULT_PROFILE.copy()
                res.update(data)
                return res
        except Exception:
            pass
    return DEFAULT_PROFILE.copy()

def save_profile(data):
    with open(PROFILE_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# ─────────────────────────────────────────────
#  Excel helpers
# ─────────────────────────────────────────────

def get_workbook():
    """Load or create the workbook."""
    if os.path.exists(DATA_FILE):
        return openpyxl.load_workbook(DATA_FILE)
    wb = openpyxl.Workbook()
    _init_workbook(wb)
    return wb


def _init_workbook(wb):
    """Create sheets with headers."""
    # Goals sheet
    if GOALS_SHEET in wb.sheetnames:
        ws_g = wb[GOALS_SHEET]
    else:
        ws_g = wb.create_sheet(GOALS_SHEET)

    goal_headers = ['id', 'name', 'description', 'category', 'target_value',
                    'unit', 'deadline', 'created_date', 'status', 'icon', 'color']
    for col, h in enumerate(goal_headers, 1):
        cell = ws_g.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='6D28D9')

    # Activities sheet
    if ACTIVITIES_SHEET in wb.sheetnames:
        ws_a = wb[ACTIVITIES_SHEET]
    else:
        ws_a = wb.create_sheet(ACTIVITIES_SHEET)

    act_headers = ['id', 'goal_id', 'activity_name', 'value', 'unit',
                   'date', 'timestamp', 'notes']
    for col, h in enumerate(act_headers, 1):
        cell = ws_a.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='0891B2')

    # Remove default sheet if present
    if 'Sheet' in wb.sheetnames:
        del wb['Sheet']

    wb.save(DATA_FILE)
    return wb


def save_wb(wb):
    try:
        wb.save(DATA_FILE)
    except PermissionError:
        raise RuntimeError("Cannot write to tracker_data.xlsx because the file is open in another program (like Microsoft Excel). Please close Excel and try again.")


def sheet_to_dicts(ws):
    """Convert a worksheet to list of dicts using first row as keys."""
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h) if h is not None else '' for h in rows[0]]
    result = []
    for row in rows[1:]:
        if all(v is None for v in row):
            continue
        d = {headers[i]: (row[i] if row[i] is not None else '') for i in range(len(headers))}
        result.append(d)
    return result


def append_row(ws, values):
    """Append a row of values to the worksheet."""
    ws.append(values)


def update_row(ws, row_idx, col_map):
    """Update specific columns in a row (row_idx is 1-based, +1 for header)."""
    headers = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]
    for col_name, value in col_map.items():
        if col_name in headers:
            col_num = headers.index(col_name) + 1
            ws.cell(row=row_idx, column=col_num, value=value)


def find_row_by_id(ws, target_id):
    """Return 1-based row index (including header) of the row with id=target_id."""
    id_col = None
    for c in range(1, ws.max_column + 1):
        if ws.cell(row=1, column=c).value == 'id':
            id_col = c
            break
    if id_col is None:
        return None
    for r in range(2, ws.max_row + 1):
        if str(ws.cell(row=r, column=id_col).value) == str(target_id):
            return r
    return None


# ─────────────────────────────────────────────
#  Serve static files
# ─────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)


# ─────────────────────────────────────────────
#  GOALS  API
# ─────────────────────────────────────────────

@app.route('/api/goals', methods=['GET'])
def get_goals():
    wb = get_workbook()
    if GOALS_SHEET not in wb.sheetnames:
        _init_workbook(wb)
        wb = get_workbook()
    ws = wb[GOALS_SHEET]
    goals = sheet_to_dicts(ws)
    return jsonify(goals)


@app.route('/api/goals', methods=['POST'])
def create_goal():
    data = request.json
    wb = get_workbook()
    if GOALS_SHEET not in wb.sheetnames:
        _init_workbook(wb)
        wb = get_workbook()
    ws = wb[GOALS_SHEET]
    goal_id = str(uuid.uuid4())[:8]
    row = [
        goal_id,
        data.get('name', ''),
        data.get('description', ''),
        data.get('category', ''),
        float(data.get('target_value', 0)),
        data.get('unit', ''),
        data.get('deadline', ''),
        datetime.now().strftime('%Y-%m-%d'),
        'active',
        data.get('icon', '🎯'),
        data.get('color', '#8b5cf6'),
    ]
    append_row(ws, row)
    save_wb(wb)
    return jsonify({'id': goal_id, 'message': 'Goal created'}), 201


@app.route('/api/goals/<goal_id>', methods=['PUT'])
def update_goal(goal_id):
    data = request.json
    wb = get_workbook()
    ws = wb[GOALS_SHEET]
    row_idx = find_row_by_id(ws, goal_id)
    if row_idx is None:
        return jsonify({'error': 'Goal not found'}), 404
    update_row(ws, row_idx, {k: v for k, v in data.items()})
    save_wb(wb)
    return jsonify({'message': 'Goal updated'})


@app.route('/api/goals/<goal_id>', methods=['DELETE'])
def delete_goal(goal_id):
    wb = get_workbook()
    ws = wb[GOALS_SHEET]
    row_idx = find_row_by_id(ws, goal_id)
    if row_idx is None:
        return jsonify({'error': 'Goal not found'}), 404
    ws.delete_rows(row_idx)
    save_wb(wb)
    return jsonify({'message': 'Goal deleted'})


# ─────────────────────────────────────────────
#  ACTIVITIES  API
# ─────────────────────────────────────────────

@app.route('/api/activities', methods=['GET'])
def get_activities():
    wb = get_workbook()
    if ACTIVITIES_SHEET not in wb.sheetnames:
        _init_workbook(wb)
        wb = get_workbook()
    ws = wb[ACTIVITIES_SHEET]
    activities = sheet_to_dicts(ws)
    # Optionally filter by date or goal_id
    goal_id = request.args.get('goal_id')
    date_filter = request.args.get('date')
    if goal_id:
        activities = [a for a in activities if str(a.get('goal_id')) == str(goal_id)]
    if date_filter:
        activities = [a for a in activities if str(a.get('date')) == str(date_filter)]
    return jsonify(activities)


@app.route('/api/activities', methods=['POST'])
def log_activity():
    data = request.json
    wb = get_workbook()
    if ACTIVITIES_SHEET not in wb.sheetnames:
        _init_workbook(wb)
        wb = get_workbook()
    ws = wb[ACTIVITIES_SHEET]
    act_id = str(uuid.uuid4())[:8]
    today = date.today().strftime('%Y-%m-%d')
    row = [
        act_id,
        data.get('goal_id', ''),
        data.get('activity_name', ''),
        float(data.get('value', 0)),
        data.get('unit', ''),
        data.get('date', today),
        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        data.get('notes', ''),
    ]
    append_row(ws, row)
    save_wb(wb)
    return jsonify({'id': act_id, 'message': 'Activity logged'}), 201


@app.route('/api/activities/<act_id>', methods=['DELETE'])
def delete_activity(act_id):
    wb = get_workbook()
    ws = wb[ACTIVITIES_SHEET]
    row_idx = find_row_by_id(ws, act_id)
    if row_idx is None:
        return jsonify({'error': 'Activity not found'}), 404
    ws.delete_rows(row_idx)
    save_wb(wb)
    return jsonify({'message': 'Activity deleted'})


# ─────────────────────────────────────────────
#  SUMMARY  API  (aggregated data for charts)
# ─────────────────────────────────────────────

@app.route('/api/summary', methods=['GET'])
def get_summary():
    wb = get_workbook()
    goals = sheet_to_dicts(wb[GOALS_SHEET]) if GOALS_SHEET in wb.sheetnames else []
    activities = sheet_to_dicts(wb[ACTIVITIES_SHEET]) if ACTIVITIES_SHEET in wb.sheetnames else []

    today_str = date.today().strftime('%Y-%m-%d')
    today_acts = [a for a in activities if str(a.get('date', '')) == today_str]

    # Progress per goal (total value logged today)
    goal_progress = {}
    for g in goals:
        gid = str(g.get('id', ''))
        total_today = sum(
            float(a.get('value', 0))
            for a in today_acts
            if str(a.get('goal_id')) == gid
        )
        total_all = sum(
            float(a.get('value', 0))
            for a in activities
            if str(a.get('goal_id')) == gid
        )
        goal_progress[gid] = {
            'today': total_today,
            'all_time': total_all,
        }

    # Last 7 days activity count
    weekly = {}
    for a in activities:
        d = str(a.get('date', ''))[:10]
        if d:
            weekly[d] = weekly.get(d, 0) + 1

    return jsonify({
        'goals': goals,
        'activities': activities,
        'today_activities': today_acts,
        'goal_progress': goal_progress,
        'weekly': weekly,
        'today': today_str,
    })


# ─────────────────────────────────────────────
#  PROFILE  API
# ─────────────────────────────────────────────

@app.route('/api/profile', methods=['GET'])
def get_profile():
    return jsonify(load_profile())


@app.route('/api/profile', methods=['POST'])
def update_profile():
    data = request.json or {}
    cur = load_profile()
    cur.update(data)
    save_profile(cur)
    return jsonify({'message': 'Profile updated successfully', 'profile': cur})


# ─────────────────────────────────────────────
#  EXPORT  API
# ─────────────────────────────────────────────

@app.route('/api/export', methods=['GET'])
def export_excel():
    from flask import send_file
    if not os.path.exists(DATA_FILE):
        return jsonify({'error': 'No data file found'}), 404
    return send_file(DATA_FILE, as_attachment=True,
                     download_name='activity_tracker_data.xlsx')


if __name__ == '__main__':
    # Ensure the workbook exists
    wb = get_workbook()
    _init_workbook(wb)
    print("=" * 50)
    print("  Activity Tracker Server Starting...")
    print("  Open: http://localhost:8050")
    print("  Data: tracker_data.xlsx")
    print("=" * 50)
    app.run(host='0.0.0.0', port=8050, debug=False)
