import os
import datetime
from flask import Flask, jsonify, request, send_from_directory, abort, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_cors import CORS
from werkzeug.utils import secure_filename 
from sqlalchemy import func, desc

#core of the project, this project directly connects to the webpage so just run this and click on the link you get in your terminal for the webpage.
app = Flask(__name__, instance_relative_config=True, static_folder='static', static_url_path='') 
app.config['SECRET_KEY'] = 'a_very_secret_key_that_you_should_change'

try:
    os.makedirs(app.instance_path, exist_ok=True)
except OSError as e:
    print(f"Error creating instance path: {e}")

app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(app.instance_path, 'reports.db')}"
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

CORS(app, supports_credentials=True, origins=["exp://*"]) 
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = 'serve_login'
login_manager.login_message = "Please log in to access this page."

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='citizen') 
    reports = db.relationship('Report', backref='author', lazy=True)

class Report(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.String(500), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    source = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) 
    image_url = db.Column(db.String(200), nullable=True)
    status = db.Column(db.String(50), nullable=False, default='new') 
    notes = db.Column(db.Text, nullable=True)
    sentiment = db.Column(db.String(20), nullable=True) 

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "source": self.source,
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "image_url": self.image_url,
            "status": self.status,
            "notes": self.notes,
            "sentiment": self.sentiment
        }

def create_dummy_users():
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(username='analyst').first():
            hashed_password = bcrypt.generate_password_hash('password').decode('utf-8')
            new_analyst = User(username='analyst', password=hashed_password, role='analyst')
            db.session.add(new_analyst)
            print("Created dummy analyst user.")
        
        if not User.query.filter_by(username='authority').first():
            hashed_password = bcrypt.generate_password_hash('password').decode('utf-8')
            new_authority = User(username='authority', password=hashed_password, role='authority')
            db.session.add(new_authority)
            print("Created dummy authority user.")
        
        db.session.commit()

@app.route('/')
def serve_home():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard_redirect'))
    return send_from_directory(app.static_folder, 'home.html')

@app.route('/login')
def serve_login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard_redirect'))
    return send_from_directory(app.static_folder, 'login.html')

@app.route('/analyst')
@login_required
def serve_analyst_dashboard():
    if current_user.role != 'analyst':
        abort(403)
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/authority')
@login_required
def serve_authority_dashboard():
    if current_user.role != 'authority':
        abort(403)
    return send_from_directory(app.static_folder, 'authority.html')

@app.route('/dashboard')
@login_required
def dashboard_redirect():
    if current_user.role == 'analyst':
        return redirect(url_for('serve_analyst_dashboard'))
    elif current_user.role == 'authority':
        return redirect(url_for('serve_authority_dashboard'))
    else:
        logout_user()
        return redirect(url_for('serve_login'))

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    
    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({"error": "Username already exists"}), 400
        
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(username=username, password=hashed_password, role='citizen')
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({"message": "User registered successfully"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    user = User.query.filter_by(username=username).first()
    
    if user and bcrypt.check_password_hash(user.password, password):
        login_user(user, remember=True)
        return jsonify({
            "id": user.id,
            "username": user.username,
            "role": user.role
        }), 200
        
    return jsonify({"error": "Invalid username or password"}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    logout_user()
    return jsonify({"message": "Logged out successfully"}), 200

@app.route('/api/check_session', methods=['GET'])
def check_session():
    if current_user.is_authenticated:
        return jsonify({
            "isLoggedIn": True,
            "user": {"id": current_user.id, "username": current_user.username, "role": current_user.role}
        }), 200
    return jsonify({"isLoggedIn": False}), 200

@app.route('/uploads/<filename>')
def get_uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except FileNotFoundError:
        abort(404)

@app.route('/api/reports', methods=['GET'])
@login_required
def get_reports():
    if current_user.role == 'analyst':
        reports_from_db = Report.query.order_by(Report.timestamp.desc()).all()
    elif current_user.role == 'authority':
        reports_from_db = Report.query.filter(Report.status != 'new').order_by(Report.timestamp.desc()).all()
    else:
        return jsonify({"error": "Not authorized"}), 403
        
    reports_list = [report.to_dict() for report in reports_from_db]
    return jsonify(reports_list)

@app.route('/api/reports/<int:report_id>/status', methods=['PUT'])
@login_required
def update_report_status(report_id):
    if current_user.role != 'analyst':
        return jsonify({"error": "Not authorized"}), 403
        
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({"error": "Report not found"}), 404
        
    data = request.json
    new_status = data.get('status')
    new_notes = data.get('notes')
    
    if new_status not in ['new', 'verified', 'action_taken', 'false_alarm']:
        return jsonify({"error": "Invalid status"}), 400
        
    report.status = new_status
    if new_notes is not None:
        report.notes = new_notes
        
    db.session.commit()
    return jsonify(report.to_dict()), 200

@app.route('/api/reports', methods=['POST'])
@login_required
def add_report():
    if current_user.role != 'citizen':
        return jsonify({"error": "Only citizens can submit reports"}), 403

    description = request.form.get('description')
    latitude = request.form.get('latitude')
    longitude = request.form.get('longitude')
    
    if not description or not latitude or not longitude:
        return jsonify({"error": "Missing description or location data"}), 400
        
    image_url_to_save = None

    if 'image' in request.files:
        file = request.files['image']
        if file.filename != '':
            filename = secure_filename(f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}_{file.filename}")
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)
            image_url_to_save = f"/uploads/{filename}"

    new_report = Report(
        description=description,
        latitude=float(latitude),
        longitude=float(longitude),
        source="Crowdsource", 
        user_id=current_user.id,
        image_url=image_url_to_save,
        sentiment='neutral'
    )
    
    db.session.add(new_report)
    db.session.commit()
    
    return jsonify(new_report.to_dict()), 201

@app.route('/api/my-reports', methods=['GET'])
@login_required
def get_my_reports():
    if current_user.role != 'citizen':
        return jsonify({"error": "Not authorized"}), 403
    
    reports_from_db = Report.query.filter_by(user_id=current_user.id).order_by(Report.timestamp.desc()).all()
    reports_list = [report.to_dict() for report in reports_from_db]
    return jsonify(reports_list)
    
@app.route('/api/reports/summary', methods=['GET'])
@login_required
def get_report_summary():
    if current_user.role != 'authority':
        return jsonify({"error": "Not authorized"}), 403
        
    processed_reports = Report.query.filter(Report.status != 'new').all()
    
    kpi_counts = {
        'verified': 0,
        'action_taken': 0,
        'false_alarm': 0
    }
    
    source_counts = {
        'Crowdsource': 0,
        'Social Media': 0
    }
    
    for report in processed_reports:
        if report.status in kpi_counts:
            kpi_counts[report.status] += 1
        if report.source in source_counts:
            source_counts[report.source] += 1
            
    latest_processed_reports = Report.query.filter(Report.status != 'new').order_by(Report.timestamp.desc()).limit(5).all()

    summary = {
        "kpi_counts": kpi_counts,
        "source_counts": source_counts,
        "latest_processed_reports": [r.to_dict() for r in latest_processed_reports]
    }
            
    return jsonify(summary), 200

if __name__ == '__main__':
    create_dummy_users()
    app.run(host='0.0.0.0', port=5000, debug=True)

