from flask import Blueprint, render_template, request, flash, redirect, url_for
from flask_login import login_user, logout_user, login_required
from models import User
from werkzeug.security import check_password_hash

auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email_raw = request.form.get('email') or ''
        email = email_raw.strip().lower()
        password = request.form.get('password') or ''
        
        # Consultamos el usuario de forma tolerante a mayúsculas/minúsculas o espacios
        from sqlalchemy import func
        user = User.query.filter(func.lower(User.email) == email).first()
        if not user:
            user = User.query.filter_by(email=email_raw.strip()).first()
        
        # Validar contraseña cifrada
        if user and check_password_hash(user.password_hash, password):
            login_user(user, remember=True) # Iniciar sesión persistente en PWA (no expira al cerrar la app)
            flash('¡Sesión iniciada con éxito!', 'success')
            
            # Redirección inteligente basada en ROL o hacia la raíz para delegar el control
            return redirect(url_for('index'))
        
        flash('Tus credenciales (Correo o Contraseña) son inválidas.', 'error')
        return redirect(url_for('auth_bp.login'))
        
    # GET: Mostrar Formulario normal
    return render_template('auth/login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user() # Rompe la sesión
    flash('¡Has cerrado tu sesión de manera segura!', 'success')
    return redirect(url_for('auth_bp.login'))
