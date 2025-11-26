import { DataManager } from './supabase-client.js';
import TimetableGenerator from './timetable.js';
import ConstraintManager from './constraints.js';
import ExportManager from './export.js';

class TimetableApp {
    constructor() {
        this.appState = {
            periods: [],
            subjects: [],
            classes: [],
            teachers: [],
            timetable: {},
            constraints: {},
            currentView: 'dashboard'
        };

        this.timetableGenerator = new TimetableGenerator(this.appState);
        this.constraintManager = new ConstraintManager(this.appState);
        this.exportManager = new ExportManager(this.appState);
        
        this.init();
    }

    async init() {
        // Load data
        await this.loadData();
        
        // Initialize UI
        this.setupEventListeners();
        this.updateDashboard();
        this.renderPeriodsList();
        this.renderSubjectsList();
        this.renderClassesList();
        this.renderTeachersList();
        
        console.log('Timetable App initialized');
    }

    async loadData() {
        try {
            const data = await DataManager.loadAllData();
            this.appState = { ...this.appState, ...data };
        } catch (error) {
            console.error('Failed to load data:', error);
            // Continue with empty state
        }
    }

    async saveData() {
        try {
            await DataManager.saveAllData(this.appState);
            return true;
        } catch (error) {
            console.error('Failed to save data:', error);
            return false;
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.target.getAttribute('data-page');
                this.showPage(page);
            });
        });

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.showTab(tabName);
            });
        });

        // Quick actions
        document.getElementById('generate-timetable').addEventListener('click', () => {
            this.showPage('timetable');
            this.generateTimetable();
        });

        document.getElementById('export-all').addEventListener('click', () => {
            this.showPage('export');
            this.exportAll();
        });

        // Setup actions
        document.getElementById('add-period').addEventListener('click', () => this.showPeriodModal());
        document.getElementById('add-subject-btn').addEventListener('click', () => this.showSubjectModal());
        document.getElementById('add-class-btn').addEventListener('click', () => this.showClassModal());
        document.getElementById('add-teacher-btn').addEventListener('click', () => this.showTeacherModal());

        // Modal save/cancel buttons
        document.getElementById('save-period').addEventListener('click', () => this.savePeriod());
        document.getElementById('cancel-period').addEventListener('click', () => this.hidePeriodModal());
        document.getElementById('save-subject').addEventListener('click', () => this.saveSubject());
        document.getElementById('cancel-subject').addEventListener('click', () => this.hideSubjectModal());
        document.getElementById('save-class').addEventListener('click', () => this.saveClass());
        document.getElementById('cancel-class').addEventListener('click', () => this.hideClassModal());
        document.getElementById('save-teacher').addEventListener('click', () => this.saveTeacher());
        document.getElementById('cancel-teacher').addEventListener('click', () => this.hideTeacherModal());

        // Constraints
        document.getElementById('save-constraints').addEventListener('click', () => this.saveConstraints());

        // Timetable actions
        document.getElementById('generate-btn').addEventListener('click', () => this.generateTimetable());
        document.getElementById('save-timetable').addEventListener('click', () => this.saveTimetable());

        // Export actions
        document.getElementById('export-btn').addEventListener('click', () => this.handleExport());
        document.getElementById('export-type').addEventListener('change', () => this.toggleExportSelection());
    }

    showPage(pageId) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // Show target page
        document.getElementById(pageId).classList.add('active');
        
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`.nav-link[data-page="${pageId}"]`).classList.add('active');
        
        this.appState.currentView = pageId;
    }

    showTab(tabId) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Show target tab content
        document.getElementById(`${tabId}-tab`).classList.add('active');
        
        // Update tab headers
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    }

    updateDashboard() {
        document.getElementById('teachers-count').textContent = this.appState.teachers.length;
        document.getElementById('subjects-count').textContent = this.appState.subjects.length;
        document.getElementById('classes-count').textContent = this.appState.classes.length;
        document.getElementById('periods-count').textContent = this.appState.periods.length;
    }

    // Period management
    renderPeriodsList() {
        const tbody = document.getElementById('periods-list');
        tbody.innerHTML = '';

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
            tbody.appendChild(row);
        });
    }

    showPeriodModal(editId = null) {
        const modal = document.getElementById('period-modal');
        
        if (editId) {
            // Edit mode
            const period = this.appState.periods.find(p => p.id === editId);
            if (period) {
                document.getElementById('modal-period-name').value = period.name;
                document.getElementById('modal-period-start').value = period.start_time;
                document.getElementById('modal-period-end').value = period.end_time;
                document.getElementById('modal-period-type').value = period.type;
                document.getElementById('save-period').setAttribute('data-edit-id', editId);
            }
        } else {
            // Add mode
            document.getElementById('modal-period-name').value = '';
            document.getElementById('modal-period-start').value = '';
            document.getElementById('modal-period-end').value = '';
            document.getElementById('modal-period-type').value = 'lesson';
            document.getElementById('save-period').removeAttribute('data-edit-id');
        }
        
        modal.style.display = 'flex';
    }

    hidePeriodModal() {
        document.getElementById('period-modal').style.display = 'none';
    }

    savePeriod() {
        const name = document.getElementById('modal-period-name').value;
        const start = document.getElementById('modal-period-start').value;
        const end = document.getElementById('modal-period-end').value;
        const type = document.getElementById('modal-period-type').value;
        const editId = document.getElementById('save-period').getAttribute('data-edit-id');
        
        if (name && start && end) {
            if (editId) {
                // Update existing period
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
                // Create new period
                const newPeriod = {
                    id: Date.now().toString(),
                    name,
                    start_time: start,
                    end_time: end,
                    type,
                    created_at: new Date().toISOString()
                };
                this.appState.periods.push(newPeriod);
            }
            
            this.renderPeriodsList();
            this.saveData();
            this.hidePeriodModal();
            this.updateDashboard();
        } else {
            alert('Please fill in all fields');
        }
    }

    editPeriod(id) {
        this.showPeriodModal(id);
    }

    deletePeriod(id) {
        if (confirm('Are you sure you want to delete this period?')) {
            this.appState.periods = this.appState.periods.filter(p => p.id !== id);
            this.renderPeriodsList();
            this.saveData();
            this.updateDashboard();
        }
    }

    // Subject management
    renderSubjectsList() {
        const tbody = document.getElementById('subjects-list');
        tbody.innerHTML = '';

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
            tbody.appendChild(row);
        });
    }

    showSubjectModal(editId = null) {
        const modal = document.getElementById('subject-modal');
        
        if (editId) {
            // Edit mode
            const subject = this.appState.subjects.find(s => s.id === editId);
            if (subject) {
                document.getElementById('modal-subject-name').value = subject.name;
                document.getElementById('modal-subject-code').value = subject.code || '';
                document.getElementById('modal-subject-lessons').value = subject.target_lessons_per_week || 5;
                document.getElementById('modal-subject-priority').value = subject.priority || 'medium';
                document.getElementById('save-subject').setAttribute('data-edit-id', editId);
            }
        } else {
            // Add mode
            document.getElementById('modal-subject-name').value = '';
            document.getElementById('modal-subject-code').value = '';
            document.getElementById('modal-subject-lessons').value = 5;
            document.getElementById('modal-subject-priority').value = 'medium';
            document.getElementById('save-subject').removeAttribute('data-edit-id');
        }
        
        modal.style.display = 'flex';
    }

    hideSubjectModal() {
        document.getElementById('subject-modal').style.display = 'none';
    }

    saveSubject() {
        const name = document.getElementById('modal-subject-name').value;
        const code = document.getElementById('modal-subject-code').value;
        const lessons = parseInt(document.getElementById('modal-subject-lessons').value);
        const priority = document.getElementById('modal-subject-priority').value;
        const editId = document.getElementById('save-subject').getAttribute('data-edit-id');
        
        if (name && lessons) {
            if (editId) {
                // Update existing subject
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
                // Create new subject
                const newSubject = {
                    id: Date.now().toString(),
                    name,
                    code,
                    target_lessons_per_week: lessons,
                    priority,
                    created_at: new Date().toISOString()
                };
                this.appState.subjects.push(newSubject);
            }
            
            this.renderSubjectsList();
            this.saveData();
            this.hideSubjectModal();
            this.updateDashboard();
        } else {
            alert('Please fill in all required fields');
        }
    }

    editSubject(id) {
        this.showSubjectModal(id);
    }

    deleteSubject(id) {
        if (confirm('Are you sure you want to delete this subject?')) {
            this.appState.subjects = this.appState.subjects.filter(s => s.id !== id);
            this.renderSubjectsList();
            this.saveData();
            this.updateDashboard();
        }
    }

    // Class management
    renderClassesList() {
        const tbody = document.getElementById('classes-list');
        tbody.innerHTML = '';

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
            tbody.appendChild(row);
        });
    }

    showClassModal(editId = null) {
        const modal = document.getElementById('class-modal');
        
        if (editId) {
            // Edit mode
            const cls = this.appState.classes.find(c => c.id === editId);
            if (cls) {
                document.getElementById('modal-class-level').value = cls.level;
                document.getElementById('modal-class-stream').value = cls.stream;
                document.getElementById('modal-class-students').value = cls.student_count || '';
                document.getElementById('save-class').setAttribute('data-edit-id', editId);
            }
        } else {
            // Add mode
            document.getElementById('modal-class-level').value = '';
            document.getElementById('modal-class-stream').value = '';
            document.getElementById('modal-class-students').value = '';
            document.getElementById('save-class').removeAttribute('data-edit-id');
        }
        
        modal.style.display = 'flex';
    }

    hideClassModal() {
        document.getElementById('class-modal').style.display = 'none';
    }

    saveClass() {
        const level = document.getElementById('modal-class-level').value;
        const stream = document.getElementById('modal-class-stream').value;
        const students = document.getElementById('modal-class-students').value ? 
            parseInt(document.getElementById('modal-class-students').value) : null;
        const editId = document.getElementById('save-class').getAttribute('data-edit-id');
        
        if (level && stream) {
            if (editId) {
                // Update existing class
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
                // Create new class
                const newClass = {
                    id: Date.now().toString(),
                    level,
                    stream,
                    student_count: students,
                    created_at: new Date().toISOString()
                };
                this.appState.classes.push(newClass);
            }
            
            this.renderClassesList();
            this.saveData();
            this.hideClassModal();
            this.updateDashboard();
        } else {
            alert('Please fill in all required fields');
        }
    }

    editClass(id) {
        this.showClassModal(id);
    }

    deleteClass(id) {
        if (confirm('Are you sure you want to delete this class?')) {
            this.appState.classes = this.appState.classes.filter(c => c.id !== id);
            this.renderClassesList();
            this.saveData();
            this.updateDashboard();
        }
    }

    // Teacher management
    renderTeachersList() {
        const tbody = document.getElementById('teachers-list');
        tbody.innerHTML = '';

        this.appState.teachers.forEach(teacher => {
            // Get subject names
            const subjectNames = teacher.subjects ? teacher.subjects.map(subjectId => {
                const subject = this.appState.subjects.find(s => s.id === subjectId);
                return subject ? subject.name : 'Unknown';
            }).join(', ') : '';
            
            // Get class levels
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
            tbody.appendChild(row);
        });
    }

    showTeacherModal(editId = null) {
        const modal = document.getElementById('teacher-modal');
        const subjectsSelect = document.getElementById('modal-teacher-subjects');
        
        // Populate subjects dropdown
        subjectsSelect.innerHTML = '';
        this.appState.subjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject.id;
            option.textContent = subject.name;
            subjectsSelect.appendChild(option);
        });
        
        if (editId) {
            // Edit mode
            const teacher = this.appState.teachers.find(t => t.id === editId);
            if (teacher) {
                document.getElementById('modal-teacher-name').value = teacher.name;
                
                // Set selected subjects
                if (teacher.subjects) {
                    Array.from(subjectsSelect.options).forEach(option => {
                        option.selected = teacher.subjects.includes(option.value);
                    });
                }
                
                // Set selected class levels
                const levelsSelect = document.getElementById('modal-teacher-levels');
                if (teacher.class_levels) {
                    Array.from(levelsSelect.options).forEach(option => {
                        option.selected = teacher.class_levels.includes(option.value);
                    });
                }
                
                document.getElementById('save-teacher').setAttribute('data-edit-id', editId);
            }
        } else {
            // Add mode
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
        document.getElementById('teacher-modal').style.display = 'none';
    }

    saveTeacher() {
        const name = document.getElementById('modal-teacher-name').value;
        const subjectsSelect = document.getElementById('modal-teacher-subjects');
        const levelsSelect = document.getElementById('modal-teacher-levels');
        
        const selectedSubjects = Array.from(subjectsSelect.selectedOptions).map(option => option.value);
        const selectedLevels = Array.from(levelsSelect.selectedOptions).map(option => option.value);
        const editId = document.getElementById('save-teacher').getAttribute('data-edit-id');
        
        if (name && selectedSubjects.length > 0 && selectedLevels.length > 0) {
            if (editId) {
                // Update existing teacher
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
                // Create new teacher
                const newTeacher = {
                    id: Date.now().toString(),
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
            this.saveData();
            this.hideTeacherModal();
            this.updateDashboard();
        } else {
            alert('Please fill in all required fields and select at least one subject and class level');
        }
    }

    editTeacher(id) {
        this.showTeacherModal(id);
    }

    deleteTeacher(id) {
        if (confirm('Are you sure you want to delete this teacher?')) {
            this.appState.teachers = this.appState.teachers.filter(t => t.id !== id);
            this.renderTeachersList();
            this.saveData();
            this.updateDashboard();
        }
    }

    // Constraints management
    saveConstraints() {
        this.appState.constraints = {
            max_daily_lessons: parseInt(document.getElementById('max-daily-lessons').value),
            max_weekly_lessons: parseInt(document.getElementById('max-weekly-lessons').value),
            prefer_morning: document.getElementById('prefer-morning').checked,
            balance_workload: document.getElementById('balance-workload').checked,
            min_lessons_per_subject: 3,
            max_lessons_per_subject: 10
        };
        
        this.saveData();
        alert('Constraints saved successfully!');
    }

    async generateTimetable() {
        try {
            // Validate constraints first
            const errors = this.constraintManager.validateAllConstraints();
            if (errors.length > 0) {
                alert('Please fix the following issues:\n\n' + errors.join('\n'));
                return;
            }

            // Show loading state
            const generateBtn = document.getElementById('generate-btn');
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';

            // Generate timetable
            const timetable = await this.timetableGenerator.generate();
            this.appState.timetable = timetable;

            // Render timetable
            this.renderTimetable();

            // Save generated timetable
            await this.saveData();

            alert('Timetable generated successfully!');

        } catch (error) {
            console.error('Generation error:', error);
            alert('Error generating timetable: ' + error.message);
        } finally {
            // Reset button state
            const generateBtn = document.getElementById('generate-btn');
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate';
        }
    }

    renderTimetable() {
        const container = document.getElementById('timetable-container');
        const view = document.getElementById('timetable-view').value;
        const entity = document.getElementById('timetable-entity').value;

        let html = '';

        if (view === 'class') {
            html = this.renderClassTimetable(entity);
        } else if (view === 'teacher') {
            html = this.renderTeacherTimetable(entity);
        }

        container.innerHTML = html;
    }

    renderClassTimetable(classId) {
        // Implementation for class timetable rendering
        return '<div class="timetable">Class timetable would render here</div>';
    }

    renderTeacherTimetable(teacherId) {
        // Implementation for teacher timetable rendering
        return '<div class="timetable">Teacher timetable would render here</div>';
    }

    async saveTimetable() {
        const success = await this.saveData();
        if (success) {
            alert('Timetable saved successfully!');
        } else {
            alert('Error saving timetable');
        }
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
        exportOptions.innerHTML = '';
        
        // Add teachers
        this.appState.teachers.forEach(teacher => {
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" id="export-teacher-${teacher.id}" value="${teacher.id}"> <label for="export-teacher-${teacher.id}">${teacher.name}</label>`;
            exportOptions.appendChild(div);
        });
        
        // Add classes
        this.appState.classes.forEach(cls => {
            const className = `${cls.level} ${cls.stream}`;
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" id="export-class-${cls.id}" value="${cls.id}"> <label for="export-class-${cls.id}">${className}</label>`;
            exportOptions.appendChild(div);
        });
    }

    async handleExport() {
        const format = document.getElementById('export-format').value;
        const type = document.getElementById('export-type').value;
        
        let selectedItems = [];
        if (type === 'selected') {
            // Get selected items from checkboxes
            selectedItems = Array.from(document.querySelectorAll('#export-options input:checked'))
                .map(input => input.value);
        }

        try {
            await this.exportManager.exportTimetables(type, format, selectedItems);
            alert('Export completed successfully!');
        } catch (error) {
            alert('Export failed: ' + error.message);
        }
    }

    async exportAll() {
        this.showPage('export');
        // Trigger export of all items
        await this.exportManager.exportTimetables('teachers', 'excel');
    }
}

// Initialize the application
const app = new TimetableApp();
window.app = app; // Make app globally available for HTML onclick handlers

export default TimetableApp;