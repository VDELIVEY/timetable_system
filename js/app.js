import { DataManager } from './supabase-client.js';
import TimetableGenerator from './timetable.js';
import ConstraintManager from './constraints.js';
import ExportManager from './export.js';
import ErrorHandler from './error-handler.js';

class TimetableApp {
    constructor() {
        this.appState = {
            periods: [],
            subjects: [],
            classes: [],
            teachers: [],
            timetable: {},
            constraints: this.getDefaultConstraints(),
            currentView: 'dashboard'
        };

        this.history = {
            past: [],
            future: [],
            maxSize: 50
        };

        this.collaboration = {
            enabled: false,
            users: new Set(),
            lastUpdate: null
        };

        this.isInitialized = false;
        this.timetableGenerator = null;
        this.constraintManager = null;
        this.exportManager = null;

        ErrorHandler.init();
        this.init().catch(error => {
            console.error('App initialization failed:', error);
            ErrorHandler.showNotification('Failed to initialize application', 'error');
        });
    }

    getDefaultConstraints() {
        return {
            max_daily_lessons: 6,
            max_weekly_lessons: 25,
            prefer_morning: true,
            balance_workload: true,
            min_lessons_per_subject: 3,
            max_lessons_per_subject: 10
        };
    }

    async init() {
        try {
            await this.loadData();

            this.timetableGenerator = new TimetableGenerator(this.appState);
            this.constraintManager = new ConstraintManager(this.appState);
            this.exportManager = new ExportManager(this.appState);

            this.setupEventListeners();
            this.updateDashboard();
            this.renderPeriodsList();
            this.renderSubjectsList();
            this.renderClassesList();
            this.renderTeachersList();
            this.setupCollaboration();

            this.isInitialized = true;
            console.log('Timetable App initialized successfully');

        } catch (error) {
            throw new Error('Initialization failed: ' + error.message);
        }
    }

    async loadData() {
        try {
            const data = await DataManager.loadAllData();
            this.appState = { ...this.appState, ...data };
            this.saveToHistory();
        } catch (error) {
            console.error('Failed to load data:', error);
            ErrorHandler.showNotification('Using local backup data', 'warning');
        }
    }

    async saveData() {
        try {
            const success = await DataManager.saveAllData(this.appState);
            if (success) {
                this.saveToHistory();
                return true;
            } else {
                throw new Error('Save operation failed');
            }
        } catch (error) {
            console.error('Failed to save data:', error);
            ErrorHandler.showNotification('Failed to save data', 'error');
            return false;
        }
    }

    saveToHistory() {
        this.history.past.push(JSON.parse(JSON.stringify(this.appState)));
        if (this.history.past.length > this.history.maxSize) {
            this.history.past.shift();
        }
        this.history.future = [];
        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.history.past.length > 1) {
            this.history.future.push(this.history.past.pop());
            this.appState = JSON.parse(JSON.stringify(this.history.past[this.history.past.length - 1]));
            this.refreshUI();
            this.updateUndoRedoButtons();
        }
    }

    redo() {
        if (this.history.future.length > 0) {
            const state = this.history.future.pop();
            this.history.past.push(state);
            this.appState = JSON.parse(JSON.stringify(state));
            this.refreshUI();
            this.updateUndoRedoButtons();
        }
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.disabled = this.history.past.length <= 1;
        }
        if (redoBtn) {
            redoBtn.disabled = this.history.future.length === 0;
        }
    }

    setupCollaboration() {
        if (this.collaboration.enabled) {
            this.setupRealTimeUpdates();
        }
    }

    setupRealTimeUpdates() {
        console.log('Real-time collaboration would be set up here');
    }

    async exportData() {
        try {
            const dataStr = DataManager.exportToJSON(this.appState);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `timetable-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            ErrorHandler.showNotification('Data exported successfully', 'success');
        } catch (error) {
            ErrorHandler.showNotification('Export failed: ' + error.message, 'error');
        }
    }

    async importData(file) {
        try {
            const text = await this.readFileAsText(file);
            const importedData = DataManager.importFromJSON(text);

            if (this.validateImportedData(importedData)) {
                this.appState = { ...this.appState, ...importedData };
                await this.saveData();
                this.refreshUI();
                ErrorHandler.showNotification('Data imported successfully', 'success');
            } else {
                throw new Error('Invalid data structure');
            }
        } catch (error) {
            ErrorHandler.showNotification('Import failed: ' + error.message, 'error');
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error('File reading failed'));
            reader.readAsText(file);
        });
    }

    validateImportedData(data) {
        const required = ['periods', 'subjects', 'classes', 'teachers', 'constraints', 'timetable'];
        return required.every(key => Array.isArray(data[key]) || typeof data[key] === 'object');
    }

    async showBackupManager() {
        const backups = DataManager.getBackupHistory();
        const modal = this.createBackupModal(backups);
        document.body.appendChild(modal);
    }

    createBackupModal(backups) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        modal.innerHTML = `
            <div class="modal-content" style="background: white; padding: 2rem; border-radius: 8px; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto;">
                <h3>Backup Manager</h3>
                <div class="backup-list">
                    ${backups.map((backup, index) => `
                        <div class="backup-item">
                            <div>
                                <strong>Backup ${index + 1}</strong>
                                <div class="backup-time">${new Date(backup.timestamp).toLocaleString()}</div>
                            </div>
                            <div>
                                <button class="btn" onclick="app.restoreBackup(${index})">Restore</button>
                                <button class="btn btn-warning" onclick="app.deleteBackup(${index})">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                    ${backups.length === 0 ? '<p>No backups available</p>' : ''}
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1.5rem;">
                    <button class="btn" id="close-backup-modal">Close</button>
                    <button class="btn btn-success" onclick="app.createManualBackup()">Create Backup</button>
                </div>
            </div>
        `;

        modal.querySelector('#close-backup-modal').onclick = () => modal.remove();
        return modal;
    }

    createManualBackup() {
        DataManager.createBackup(this.appState);
        ErrorHandler.showNotification('Manual backup created', 'success');
    }

    async restoreBackup(index) {
        if (confirm('Are you sure you want to restore this backup? Current data will be replaced.')) {
            const backupData = DataManager.restoreBackup(index);
            if (backupData) {
                this.appState = { ...this.appState, ...backupData };
                await this.saveData();
                this.refreshUI();
                ErrorHandler.showNotification('Backup restored successfully', 'success');
            }
        }
    }

    deleteBackup(index) {
        if (confirm('Are you sure you want to delete this backup?')) {
            const backupHistory = DataManager.getBackupHistory();
            backupHistory.splice(index, 1);
            localStorage.setItem('backup_history', JSON.stringify(backupHistory));
            ErrorHandler.showNotification('Backup deleted', 'success');
            document.querySelector('.modal')?.remove();
            this.showBackupManager();
        }
    }

    trackEvent(category, action, label = null) {
        console.log('Analytics Event:', { category, action, label, timestamp: new Date().toISOString() });

        const analytics = JSON.parse(localStorage.getItem('timetable_analytics') || '{"events":[],"usage":{}}');
        analytics.events.push({ category, action, label, timestamp: new Date().toISOString() });

        if (!analytics.usage[category]) analytics.usage[category] = {};
        if (!analytics.usage[category][action]) analytics.usage[category][action] = 0;
        analytics.usage[category][action]++;

        localStorage.setItem('timetable_analytics', JSON.stringify(analytics));
    }

    getAnalytics() {
        return JSON.parse(localStorage.getItem('timetable_analytics') || '{"events":[],"usage":{}}');
    }

    refreshUI() {
        this.updateDashboard();
        this.renderPeriodsList();
        this.renderSubjectsList();
        this.renderClassesList();
        this.renderTeachersList();
        this.updateUndoRedoButtons();
    }

    // UI Rendering Methods
    renderPeriodsList() {
        const periodsList = document.getElementById('periods-list');
        if (!periodsList) return;

        periodsList.innerHTML = '';

        if (this.appState.periods.length === 0) {
            periodsList.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem;">
                        No periods added yet. Click "Add Period" to get started.
                    </td>
                </tr>
            `;
            return;
        }

        this.appState.periods.forEach(period => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${period.name}</td>
                <td>${period.start_time}</td>
                <td>${period.end_time}</td>
                <td>${period.type}</td>
                <td>
                    <button class="btn" onclick="app.editPeriod('${period.id}')">Edit</button>
                    <button class="btn btn-warning" onclick="app.deletePeriod('${period.id}')">Delete</button>
                </td>
            `;
            periodsList.appendChild(row);
        });
    }

    renderSubjectsList() {
        const subjectsList = document.getElementById('subjects-list');
        if (!subjectsList) return;

        subjectsList.innerHTML = '';

        if (this.appState.subjects.length === 0) {
            subjectsList.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 2rem;">
                        No subjects added yet. Click "Add Subject" to get started.
                    </td>
                </tr>
            `;
            return;
        }

        this.appState.subjects.forEach(subject => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${subject.name}</td>
                <td>${subject.code || ''}</td>
                <td>${subject.priority || 'medium'}</td>
                <td>
                    <button class="btn" onclick="app.editSubject('${subject.id}')">Edit</button>
                    <button class="btn btn-warning" onclick="app.deleteSubject('${subject.id}')">Delete</button>
                </td>
            `;
            subjectsList.appendChild(row);
        });
    }

    renderClassesList() {
        const classesList = document.getElementById('classes-list');
        if (!classesList) return;

        classesList.innerHTML = '';

        if (this.appState.classes.length === 0) {
            classesList.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 2rem;">
                        No classes added yet. Click "Add Class" to get started.
                    </td>
                </tr>
            `;
            return;
        }

        this.appState.classes.forEach(cls => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${cls.level}</td>
                <td>${cls.stream}</td>
                <td>${cls.student_count || 'N/A'}</td>
                <td>
                    <button class="btn" onclick="app.editClass('${cls.id}')">Edit</button>
                    <button class="btn btn-warning" onclick="app.deleteClass('${cls.id}')">Delete</button>
                </td>
            `;
            classesList.appendChild(row);
        });
    }

    renderTeachersList() {
        const teachersList = document.getElementById('teachers-list');
        if (!teachersList) return;

        teachersList.innerHTML = '';

        if (this.appState.teachers.length === 0) {
            teachersList.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem;">
                        No teachers added yet. Click "Add Teacher" to get started.
                    </td>
                </tr>
            `;
            return;
        }

        this.appState.teachers.forEach(teacher => {
            const subjectNames = teacher.subjects ? teacher.subjects.map(subjectId => {
                const subject = this.appState.subjects.find(s => s.id === subjectId);
                return subject ? subject.name : 'Unknown';
            }).join(', ') : '';

            const classLevels = teacher.class_levels ? teacher.class_levels.join(', ') : '';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${teacher.name}</td>
                <td>${subjectNames}</td>
                <td>${classLevels}</td>
                <td>${teacher.availability ? 'Custom' : 'All periods'}</td>
                <td>
                    <button class="btn" onclick="app.editTeacher('${teacher.id}')">Edit</button>
                    <button class="btn btn-warning" onclick="app.deleteTeacher('${teacher.id}')">Delete</button>
                </td>
            `;
            teachersList.appendChild(row);
        });
    }

    updateDashboard() {
        const teachersCount = document.getElementById('teachers-count');
        const subjectsCount = document.getElementById('subjects-count');
        const classesCount = document.getElementById('classes-count');
        const periodsCount = document.getElementById('periods-count');

        if (teachersCount) teachersCount.textContent = this.appState.teachers.length;
        if (subjectsCount) subjectsCount.textContent = this.appState.subjects.length;
        if (classesCount) classesCount.textContent = this.appState.classes.length;
        if (periodsCount) periodsCount.textContent = this.appState.periods.length;
    }

    // Modal Management Methods
    showPeriodModal(editId = null) {
        const modal = document.getElementById('period-modal');
        if (!modal) return;

        if (editId) {
            const period = this.appState.periods.find(p => p.id === editId);
            if (period) {
                document.getElementById('modal-period-name').value = period.name;
                document.getElementById('modal-period-start').value = period.start_time;
                document.getElementById('modal-period-end').value = period.end_time;
                document.getElementById('modal-period-type').value = period.type;
                document.getElementById('save-period').setAttribute('data-edit-id', editId);
            }
        } else {
            document.getElementById('modal-period-name').value = '';
            document.getElementById('modal-period-start').value = '';
            document.getElementById('modal-period-end').value = '';
            document.getElementById('modal-period-type').value = 'lesson';
            document.getElementById('save-period').removeAttribute('data-edit-id');
        }

        modal.style.display = 'flex';
    }

    hidePeriodModal() {
        const modal = document.getElementById('period-modal');
        if (modal) modal.style.display = 'none';
    }

    async savePeriod() {
        const name = document.getElementById('modal-period-name').value.trim();
        const start = document.getElementById('modal-period-start').value;
        const end = document.getElementById('modal-period-end').value;
        const type = document.getElementById('modal-period-type').value;
        const editId = document.getElementById('save-period').getAttribute('data-edit-id');

        // Validation
        if (!name || !start || !end) {
            ErrorHandler.showNotification('Please fill in all fields', 'error');
            return;
        }

        if (start >= end) {
            ErrorHandler.showNotification('End time must be after start time', 'error');
            return;
        }

        // Check for duplicate period names
        const duplicatePeriod = this.appState.periods.find(p =>
            p.name.toLowerCase() === name.toLowerCase() && p.id !== editId
        );
        if (duplicatePeriod) {
            ErrorHandler.showNotification('A period with this name already exists', 'error');
            return;
        }

        try {
            if (editId) {
                const periodIndex = this.appState.periods.findIndex(p => p.id === editId);
                if (periodIndex !== -1) {
                    this.appState.periods[periodIndex] = {
                        ...this.appState.periods[periodIndex],
                        name,
                        start_time: start,
                        end_time: end,
                        type
                    };
                }
            } else {
                const newPeriod = {
                    id: crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                        const r = Math.random() * 16 | 0;
                        const v = c == 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    }),
                    name,
                    start_time: start,
                    end_time: end,
                    type,
                    created_at: new Date().toISOString()
                };
                this.appState.periods.push(newPeriod);
            }

            this.renderPeriodsList();
            await this.saveData();
            this.hidePeriodModal();
            this.updateDashboard();
            ErrorHandler.showNotification('Period saved successfully', 'success');
        } catch (error) {
            ErrorHandler.showNotification('Failed to save period: ' + error.message, 'error');
        }
    }

    editPeriod(id) {
        this.showPeriodModal(id);
    }

    async deletePeriod(id) {
        if (confirm('Are you sure you want to delete this period?')) {
            try {
                // Remove from database
                await DataManager.deletePeriod(id);

                // Remove from local state
                this.appState.periods = this.appState.periods.filter(p => p.id !== id);

                this.renderPeriodsList();
                await this.saveData();
                this.updateDashboard();
                ErrorHandler.showNotification('Period deleted successfully', 'success');
            } catch (error) {
                ErrorHandler.showNotification('Delete failed: ' + error.message, 'error');
            }
        }
    }

    showSubjectModal(editId = null) {
        const modal = document.getElementById('subject-modal');
        if (!modal) return;

        if (editId) {
            const subject = this.appState.subjects.find(s => s.id === editId);
            if (subject) {
                document.getElementById('modal-subject-name').value = subject.name;
                document.getElementById('modal-subject-code').value = subject.code || '';
                document.getElementById('modal-subject-lessons').value = subject.target_lessons_per_week || 5;
                document.getElementById('modal-subject-priority').value = subject.priority || 'medium';
                document.getElementById('save-subject').setAttribute('data-edit-id', editId);
            }
        } else {
            document.getElementById('modal-subject-name').value = '';
            document.getElementById('modal-subject-code').value = '';
            document.getElementById('modal-subject-lessons').value = 5;
            document.getElementById('modal-subject-priority').value = 'medium';
            document.getElementById('save-subject').removeAttribute('data-edit-id');
        }

        modal.style.display = 'flex';
    }

    hideSubjectModal() {
        const modal = document.getElementById('subject-modal');
        if (modal) modal.style.display = 'none';
    }

    async saveSubject() {
        const name = document.getElementById('modal-subject-name').value.trim();
        const code = document.getElementById('modal-subject-code').value.trim();
        const lessons = parseInt(document.getElementById('modal-subject-lessons').value);
        const priority = document.getElementById('modal-subject-priority').value;
        const editId = document.getElementById('save-subject').getAttribute('data-edit-id');

        if (!name || isNaN(lessons)) {
            ErrorHandler.showNotification('Please fill in all required fields', 'error');
            return;
        }

        // Check for duplicate subject names
        const duplicateSubject = this.appState.subjects.find(s =>
            s.name.toLowerCase() === name.toLowerCase() && s.id !== editId
        );
        if (duplicateSubject) {
            ErrorHandler.showNotification('A subject with this name already exists', 'error');
            return;
        }

        try {
            if (editId) {
                const subjectIndex = this.appState.subjects.findIndex(s => s.id === editId);
                if (subjectIndex !== -1) {
                    this.appState.subjects[subjectIndex] = {
                        ...this.appState.subjects[subjectIndex],
                        name,
                        code,
                        target_lessons_per_week: lessons,
                        priority
                    };
                }
            } else {
                const newSubject = {
                    id: 'subject-' + Date.now().toString(),
                    name,
                    code,
                    target_lessons_per_week: lessons,
                    priority,
                    created_at: new Date().toISOString()
                };
                this.appState.subjects.push(newSubject);
            }

            this.renderSubjectsList();
            await this.saveData();
            this.hideSubjectModal();
            this.updateDashboard();
            ErrorHandler.showNotification('Subject saved successfully', 'success');
        } catch (error) {
            ErrorHandler.showNotification('Failed to save subject: ' + error.message, 'error');
        }
    }

    editSubject(id) {
        this.showSubjectModal(id);
    }

    async deleteSubject(id) {
        if (confirm('Are you sure you want to delete this subject?')) {
            try {
                // Remove from database
                await DataManager.deleteSubject(id);

                // Remove from local state
                this.appState.subjects = this.appState.subjects.filter(s => s.id !== id);

                this.renderSubjectsList();
                await this.saveData();
                this.updateDashboard();
                ErrorHandler.showNotification('Subject deleted successfully', 'success');
            } catch (error) {
                ErrorHandler.showNotification('Delete failed: ' + error.message, 'error');
            }
        }
    }

    showClassModal(editId = null) {
        const modal = document.getElementById('class-modal');
        if (!modal) return;

        if (editId) {
            const cls = this.appState.classes.find(c => c.id === editId);
            if (cls) {
                document.getElementById('modal-class-level').value = cls.level;
                document.getElementById('modal-class-stream').value = cls.stream;
                document.getElementById('modal-class-students').value = cls.student_count || '';
                document.getElementById('save-class').setAttribute('data-edit-id', editId);
            }
        } else {
            document.getElementById('modal-class-level').value = '';
            document.getElementById('modal-class-stream').value = '';
            document.getElementById('modal-class-students').value = '';
            document.getElementById('save-class').removeAttribute('data-edit-id');
        }

        modal.style.display = 'flex';
    }

    hideClassModal() {
        const modal = document.getElementById('class-modal');
        if (modal) modal.style.display = 'none';
    }

    async saveClass() {
        const level = document.getElementById('modal-class-level').value.trim();
        const stream = document.getElementById('modal-class-stream').value.trim();
        const students = document.getElementById('modal-class-students').value ?
            parseInt(document.getElementById('modal-class-students').value) : null;
        const editId = document.getElementById('save-class').getAttribute('data-edit-id');

        if (!level || !stream) {
            ErrorHandler.showNotification('Please fill in all required fields', 'error');
            return;
        }

        // Check for duplicate classes
        const duplicateClass = this.appState.classes.find(c =>
            c.level.toLowerCase() === level.toLowerCase() &&
            c.stream.toLowerCase() === stream.toLowerCase() &&
            c.id !== editId
        );
        if (duplicateClass) {
            ErrorHandler.showNotification('A class with this level and stream already exists', 'error');
            return;
        }

        try {
            if (editId) {
                const classIndex = this.appState.classes.findIndex(c => c.id === editId);
                if (classIndex !== -1) {
                    this.appState.classes[classIndex] = {
                        ...this.appState.classes[classIndex],
                        level,
                        stream,
                        student_count: students
                    };
                }
            } else {
                const newClass = {
                    id: 'class-' + Date.now().toString(),
                    level,
                    stream,
                    student_count: students,
                    created_at: new Date().toISOString()
                };
                this.appState.classes.push(newClass);
            }

            this.renderClassesList();
            await this.saveData();
            this.hideClassModal();
            this.updateDashboard();
            ErrorHandler.showNotification('Class saved successfully', 'success');
        } catch (error) {
            ErrorHandler.showNotification('Failed to save class: ' + error.message, 'error');
        }
    }

    editClass(id) {
        this.showClassModal(id);
    }

    async deleteClass(id) {
        if (confirm('Are you sure you want to delete this class?')) {
            try {
                // Remove from database
                await DataManager.deleteClass(id);

                // Remove from local state
                this.appState.classes = this.appState.classes.filter(c => c.id !== id);

                this.renderClassesList();
                await this.saveData();
                this.updateDashboard();
                ErrorHandler.showNotification('Class deleted successfully', 'success');
            } catch (error) {
                ErrorHandler.showNotification('Delete failed: ' + error.message, 'error');
            }
        }
    }

    showTeacherModal(editId = null) {
        const modal = document.getElementById('teacher-modal');
        const subjectsSelect = document.getElementById('modal-teacher-subjects');
        if (!modal || !subjectsSelect) return;

        subjectsSelect.innerHTML = '';
        this.appState.subjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject.id;
            option.textContent = subject.name;
            subjectsSelect.appendChild(option);
        });

        if (editId) {
            const teacher = this.appState.teachers.find(t => t.id === editId);
            if (teacher) {
                document.getElementById('modal-teacher-name').value = teacher.name;

                if (teacher.subjects) {
                    Array.from(subjectsSelect.options).forEach(option => {
                        option.selected = teacher.subjects.includes(option.value);
                    });
                }

                const levelsSelect = document.getElementById('modal-teacher-levels');
                if (teacher.class_levels) {
                    Array.from(levelsSelect.options).forEach(option => {
                        option.selected = teacher.class_levels.includes(option.value);
                    });
                }

                document.getElementById('save-teacher').setAttribute('data-edit-id', editId);
            }
        } else {
            document.getElementById('modal-teacher-name').value = '';
            Array.from(subjectsSelect.options).forEach(option => {
                option.selected = false;
            });
            const levelsSelect = document.getElementById('modal-teacher-levels');
            Array.from(levelsSelect.options).forEach(option => {
                option.selected = false;
            });
            document.getElementById('save-teacher').removeAttribute('data-edit-id');
        }

        modal.style.display = 'flex';
    }

    hideTeacherModal() {
        const modal = document.getElementById('teacher-modal');
        if (modal) modal.style.display = 'none';
    }

    async saveTeacher() {
        const name = document.getElementById('modal-teacher-name').value.trim();
        const subjectsSelect = document.getElementById('modal-teacher-subjects');
        const levelsSelect = document.getElementById('modal-teacher-levels');

        const selectedSubjects = Array.from(subjectsSelect.selectedOptions).map(option => option.value);
        const selectedLevels = Array.from(levelsSelect.selectedOptions).map(option => option.value);
        const editId = document.getElementById('save-teacher').getAttribute('data-edit-id');

        if (!name || selectedSubjects.length === 0 || selectedLevels.length === 0) {
            ErrorHandler.showNotification('Please fill in all required fields and select at least one subject and class level', 'error');
            return;
        }

        // Check for duplicate teacher names
        const duplicateTeacher = this.appState.teachers.find(t =>
            t.name.toLowerCase() === name.toLowerCase() && t.id !== editId
        );
        if (duplicateTeacher) {
            ErrorHandler.showNotification('A teacher with this name already exists', 'error');
            return;
        }

        try {
            if (editId) {
                const teacherIndex = this.appState.teachers.findIndex(t => t.id === editId);
                if (teacherIndex !== -1) {
                    this.appState.teachers[teacherIndex] = {
                        ...this.appState.teachers[teacherIndex],
                        name,
                        subjects: selectedSubjects,
                        class_levels: selectedLevels
                    };
                }
            } else {
                const newTeacher = {
                    id: 'teacher-' + Date.now().toString(),
                    name,
                    subjects: selectedSubjects,
                    class_levels: selectedLevels,
                    availability: {},
                    preferences: {},
                    created_at: new Date().toISOString()
                };
                this.appState.teachers.push(newTeacher);
            }

            this.renderTeachersList();
            await this.saveData();
            this.hideTeacherModal();
            this.updateDashboard();
            ErrorHandler.showNotification('Teacher saved successfully', 'success');
        } catch (error) {
            ErrorHandler.showNotification('Failed to save teacher: ' + error.message, 'error');
        }
    }

    editTeacher(id) {
        this.showTeacherModal(id);
    }

    async deleteTeacher(id) {
        if (confirm('Are you sure you want to delete this teacher?')) {
            try {
                // Remove from database
                await DataManager.deleteTeacher(id);

                // Remove from local state
                this.appState.teachers = this.appState.teachers.filter(t => t.id !== id);

                this.renderTeachersList();
                await this.saveData();
                this.updateDashboard();
                ErrorHandler.showNotification('Teacher deleted successfully', 'success');
            } catch (error) {
                ErrorHandler.showNotification('Delete failed: ' + error.message, 'error');
            }
        }
    }

    async saveConstraints() {
        try {
            this.appState.constraints = {
                max_daily_lessons: parseInt(document.getElementById('max-daily-lessons').value),
                max_weekly_lessons: parseInt(document.getElementById('max-weekly-lessons').value),
                prefer_morning: document.getElementById('prefer-morning').checked,
                balance_workload: document.getElementById('balance-workload').checked,
                min_lessons_per_subject: 3,
                max_lessons_per_subject: 10
            };

            await this.saveData();
            ErrorHandler.showNotification('Constraints saved successfully!', 'success');
        } catch (error) {
            ErrorHandler.showNotification('Failed to save constraints: ' + error.message, 'error');
        }
    }

    async generateTimetable() {
        try {
            this.trackEvent('timetable', 'generation_started');

            const errors = this.constraintManager.validateAllConstraints();
            if (errors.length > 0) {
                ErrorHandler.showNotification('Please fix validation errors before generating', 'warning');
                this.showValidationErrors(errors);
                return;
            }

            const generateBtn = document.getElementById('generate-btn');
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generating...';
            }

            const timetable = await this.timetableGenerator.generate();
            this.appState.timetable = timetable;

            this.renderTimetable();
            await this.saveData();

            ErrorHandler.showNotification('Timetable generated successfully!', 'success');
            this.trackEvent('timetable', 'generation_completed', 'success');

        } catch (error) {
            console.error('Generation error:', error);
            ErrorHandler.showNotification('Error generating timetable: ' + error.message, 'error');
            this.trackEvent('timetable', 'generation_failed', error.message);
        } finally {
            const generateBtn = document.getElementById('generate-btn');
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate';
            }
        }
    }

    renderTimetable() {
        const timetableContainer = document.getElementById('timetable-container');
        if (!timetableContainer) return;

        if (Object.keys(this.appState.timetable).length === 0) {
            timetableContainer.innerHTML = `
                <div class="alert alert-warning">
                    No timetable generated yet. Click "Generate" to create one.
                </div>
            `;
            return;
        }

        let html = '<div class="timetable">';
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        // Header row
        html += '<div class="timetable-header">Period</div>';
        days.forEach(day => {
            html += `<div class="timetable-header">${day}</div>`;
        });

        // Period rows
        this.appState.periods.forEach(period => {
            html += `<div class="timetable-cell period-cell">${period.name}<br>${period.start_time} - ${period.end_time}</div>`;

            days.forEach(day => {
                if (period.type === 'break' || period.type === 'lunch') {
                    html += `<div class="timetable-cell break-cell">${period.type === 'break' ? 'Break' : 'Lunch'}</div>`;
                } else {
                    const classSlots = this.appState.timetable[day]?.[period.id] || {};
                    let slotContent = '';

                    // Show all class slots for this period
                    for (const classId in classSlots) {
                        const slot = classSlots[classId];
                        if (slot.subject_id) {
                            const subject = this.appState.subjects.find(s => s.id === slot.subject_id);
                            const teacher = this.appState.teachers.find(t => t.id === slot.teacher_id);
                            const cls = this.appState.classes.find(c => c.id === slot.class_id);

                            slotContent += `
                                <div class="lesson">
                                    <strong>${subject?.name || 'Unknown'}</strong><br>
                                    ${teacher?.name || 'Unknown'}<br>
                                    ${cls?.level || ''} ${cls?.stream || ''}
                                </div>
                            `;
                        }
                    }

                    if (!slotContent) {
                        slotContent = 'Free';
                    }

                    html += `<div class="timetable-cell">${slotContent}</div>`;
                }
            });
        });

        html += '</div>';
        timetableContainer.innerHTML = html;
    }

    showValidationErrors(errors) {
        const errorList = errors.map(error => `<li>${error}</li>`).join('');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="background: white; padding: 2rem; border-radius: 8px; width: 90%; max-width: 500px;">
                <h3>Validation Errors</h3>
                <ul>${errorList}</ul>
                <button class="btn" onclick="this.closest('.modal').remove()" style="margin-top: 1rem;">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async saveTimetable() {
        try {
            await this.saveData();
            ErrorHandler.showNotification('Timetable saved successfully!', 'success');
        } catch (error) {
            ErrorHandler.showNotification('Failed to save timetable: ' + error.message, 'error');
        }
    }

    showImportDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            if (e.target.files[0]) {
                this.importData(e.target.files[0]);
            }
        };
        input.click();
    }

    toggleExportSelection() {
        const exportType = document.getElementById('export-type').value;
        const exportSelection = document.getElementById('export-selection');

        if (exportType === 'selected') {
            exportSelection.style.display = 'block';
            this.populateExportOptions();
        } else {
            exportSelection.style.display = 'none';
        }
    }

    populateExportOptions() {
        const exportOptions = document.getElementById('export-options');
        if (!exportOptions) return;

        exportOptions.innerHTML = '';

        // Add teachers
        this.appState.teachers.forEach(teacher => {
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" id="teacher-${teacher.id}" value="${teacher.id}"> <label for="teacher-${teacher.id}">${teacher.name}</label>`;
            exportOptions.appendChild(div);
        });

        // Add classes
        this.appState.classes.forEach(cls => {
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" id="class-${cls.id}" value="${cls.id}"> <label for="class-${cls.id}">${cls.level} ${cls.stream}</label>`;
            exportOptions.appendChild(div);
        });
    }

    async handleExport() {
        const format = document.getElementById('export-format').value;
        const type = document.getElementById('export-type').value;

        let selectedItems = [];
        if (type === 'selected') {
            const checkboxes = document.querySelectorAll('#export-options input[type="checkbox"]:checked');
            selectedItems = Array.from(checkboxes).map(cb => cb.value);
        }

        try {
            await this.exportManager.exportTimetables(type, format, selectedItems);
            ErrorHandler.showNotification('Export completed successfully!', 'success');
        } catch (error) {
            ErrorHandler.showNotification('Export failed: ' + error.message, 'error');
        }
    }

    async exportAll() {
        this.showPage('export');
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.target.getAttribute('data-page');
                this.showPage(page);
                this.trackEvent('navigation', 'page_view', page);
            });
        });

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.showTab(tabName);
            });
        });

        // Quick actions
        document.getElementById('generate-timetable')?.addEventListener('click', () => {
            this.showPage('timetable');
            this.generateTimetable();
        });

        document.getElementById('export-all')?.addEventListener('click', () => {
            this.showPage('export');
        });

        // Data management
        document.getElementById('import-btn')?.addEventListener('click', () => this.showImportDialog());
        document.getElementById('export-data-btn')?.addEventListener('click', () => this.exportData());
        document.getElementById('backup-btn')?.addEventListener('click', () => this.showBackupManager());

        // Setup actions
        document.getElementById('add-period')?.addEventListener('click', () => this.showPeriodModal());
        document.getElementById('add-subject-btn')?.addEventListener('click', () => this.showSubjectModal());
        document.getElementById('add-class-btn')?.addEventListener('click', () => this.showClassModal());
        document.getElementById('add-teacher-btn')?.addEventListener('click', () => this.showTeacherModal());

        // Modal save/cancel buttons
        document.getElementById('save-period')?.addEventListener('click', () => this.savePeriod());
        document.getElementById('cancel-period')?.addEventListener('click', () => this.hidePeriodModal());
        document.getElementById('save-subject')?.addEventListener('click', () => this.saveSubject());
        document.getElementById('cancel-subject')?.addEventListener('click', () => this.hideSubjectModal());
        document.getElementById('save-class')?.addEventListener('click', () => this.saveClass());
        document.getElementById('cancel-class')?.addEventListener('click', () => this.hideClassModal());
        document.getElementById('save-teacher')?.addEventListener('click', () => this.saveTeacher());
        document.getElementById('cancel-teacher')?.addEventListener('click', () => this.hideTeacherModal());

        // Constraints
        document.getElementById('save-constraints')?.addEventListener('click', () => this.saveConstraints());

        // Timetable actions
        document.getElementById('generate-btn')?.addEventListener('click', () => this.generateTimetable());
        document.getElementById('save-timetable')?.addEventListener('click', () => this.saveTimetable());

        // Export actions
        document.getElementById('export-btn')?.addEventListener('click', () => this.handleExport());
        document.getElementById('export-type')?.addEventListener('change', () => this.toggleExportSelection());

        // Undo/Redo
        document.getElementById('undo-btn')?.addEventListener('click', () => this.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => this.redo());

        this.trackEvent('app', 'initialized');
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        document.getElementById(pageId)?.classList.add('active');

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`.nav-link[data-page="${pageId}"]`)?.classList.add('active');

        this.appState.currentView = pageId;
    }

    showTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        document.getElementById(`${tabId}-tab`)?.classList.add('active');

        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add('active');
    }
}

const app = new TimetableApp();
window.app = app;

export default TimetableApp;