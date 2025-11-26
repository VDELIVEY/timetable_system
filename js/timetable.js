import { DataManager } from './supabase-client.js';

class TimetableGenerator {
    constructor(appState) {
        this.appState = appState;
        this.days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    }

    // Generate timetable based on constraints
    async generate() {
        console.log('Starting timetable generation...');
        
        // Validate input data
        if (!this.validateData()) {
            throw new Error('Invalid data. Please check your setup.');
        }

        // Initialize empty timetable
        const timetable = this.initializeTimetable();

        // Step 1: Place fixed elements (breaks, lunch)
        this.placeFixedElements(timetable);

        // Step 2: Create lesson slots based on subject frequency targets
        const lessonSlots = this.createLessonSlots();

        // Step 3: Assign lessons using priority-based algorithm
        await this.assignLessons(timetable, lessonSlots);

        // Step 4: Optimize and resolve conflicts
        await this.optimizeTimetable(timetable);

        return timetable;
    }

    validateData() {
        const { periods, subjects, classes, teachers } = this.appState;
        
        if (periods.length === 0) {
            alert('Please set up school periods first.');
            return false;
        }
        
        if (subjects.length === 0) {
            alert('Please add subjects first.');
            return false;
        }
        
        if (classes.length === 0) {
            alert('Please add classes and streams first.');
            return false;
        }
        
        if (teachers.length === 0) {
            alert('Please add teachers first.');
            return false;
        }

        return true;
    }

    initializeTimetable() {
        const timetable = {};
        this.days.forEach(day => {
            timetable[day] = {};
            this.appState.periods.forEach(period => {
                timetable[day][period.id] = {};
                this.appState.classes.forEach(cls => {
                    timetable[day][period.id][cls.id] = {
                        day: day,
                        period_id: period.id,
                        class_id: cls.id,
                        subject_id: null,
                        teacher_id: null,
                        room_id: null,
                        is_break: period.type !== 'lesson'
                    };
                });
            });
        });
        return timetable;
    }

    placeFixedElements(timetable) {
        this.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (period.type !== 'lesson') {
                    this.appState.classes.forEach(cls => {
                        timetable[day][period.id][cls.id].is_break = true;
                    });
                }
            });
        });
    }

    createLessonSlots() {
        const slots = [];
        
        this.appState.classes.forEach(cls => {
            this.appState.subjects.forEach(subject => {
                const targetLessons = subject.target_lessons_per_week || 5;
                
                for (let i = 0; i < targetLessons; i++) {
                    slots.push({
                        class_id: cls.id,
                        subject_id: subject.id,
                        priority: subject.priority || 'medium',
                        assigned: false
                    });
                }
            });
        });

        // Sort by priority (high first, then medium, then low)
        slots.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });

        return slots;
    }

    async assignLessons(timetable, lessonSlots) {
        const teacherLoad = this.initializeTeacherLoad();
        const classLoad = this.initializeClassLoad();

        for (const slot of lessonSlots) {
            if (slot.assigned) continue;

            const bestAssignment = this.findBestAssignment(slot, timetable, teacherLoad, classLoad);
            
            if (bestAssignment) {
                this.assignLesson(timetable, bestAssignment);
                slot.assigned = true;
                teacherLoad[bestAssignment.teacher_id]++;
                classLoad[bestAssignment.class_id][bestAssignment.day]++;
                
                // Update UI progress
                this.updateProgress(lessonSlots);
                await this.delay(10); // Small delay for UI responsiveness
            }
        }
    }

    findBestAssignment(slot, timetable, teacherLoad, classLoad) {
        const availableTeachers = this.getAvailableTeachers(slot.subject_id);
        const bestAssignments = [];

        this.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (period.type !== 'lesson') return;

                const classSlot = timetable[day][period.id][slot.class_id];
                if (classSlot.subject_id || classSlot.is_break) return;

                availableTeachers.forEach(teacher => {
                    if (this.isTeacherAvailable(teacher, day, period.id, timetable) &&
                        this.isAssignmentValid(teacher, slot.class_id, day, period.id, timetable)) {
                        
                        const score = this.calculateAssignmentScore(
                            teacher, slot, day, period.id, teacherLoad, classLoad
                        );
                        
                        bestAssignments.push({
                            teacher_id: teacher.id,
                            class_id: slot.class_id,
                            subject_id: slot.subject_id,
                            day: day,
                            period_id: period.id,
                            score: score
                        });
                    }
                });
            });
        });

        if (bestAssignments.length === 0) return null;

        // Return the assignment with the highest score
        return bestAssignments.sort((a, b) => b.score - a.score)[0];
    }

    getAvailableTeachers(subjectId) {
        return this.appState.teachers.filter(teacher => 
            teacher.subjects && teacher.subjects.includes(subjectId)
        );
    }

    isTeacherAvailable(teacher, day, periodId, timetable) {
        // Check if teacher is already assigned in this period
        for (const classId in timetable[day][periodId]) {
            const slot = timetable[day][periodId][classId];
            if (slot.teacher_id === teacher.id) {
                return false;
            }
        }

        // Check teacher's availability preferences
        if (teacher.availability && teacher.availability[day]) {
            return teacher.availability[day].includes(periodId);
        }

        return true;
    }

    isAssignmentValid(teacher, classId, day, periodId, timetable) {
        // Check if teacher can teach this class level
        const cls = this.appState.classes.find(c => c.id === classId);
        if (teacher.class_levels && !teacher.class_levels.includes(cls.level)) {
            return false;
        }

        // Check if teacher has reached daily limit
        const dailyLessons = this.countTeacherDailyLessons(teacher.id, day, timetable);
        if (dailyLessons >= this.appState.constraints.max_daily_lessons) {
            return false;
        }

        return true;
    }

    calculateAssignmentScore(teacher, slot, day, periodId, teacherLoad, classLoad) {
        let score = 100;

        // Priority subject bonus
        if (slot.priority === 'high') score += 50;
        if (slot.priority === 'medium') score += 25;

        // Teacher load balancing (prefer less loaded teachers)
        const currentLoad = teacherLoad[teacher.id] || 0;
        const avgLoad = Object.values(teacherLoad).reduce((a, b) => a + b, 0) / Object.keys(teacherLoad).length;
        score += (avgLoad - currentLoad) * 10;

        // Class load balancing
        const classDailyLoad = classLoad[slot.class_id][day] || 0;
        score -= classDailyLoad * 5;

        // Morning preference for core subjects
        if (this.appState.constraints.prefer_morning && slot.priority === 'high') {
            const period = this.appState.periods.find(p => p.id === periodId);
            if (period && this.isMorningPeriod(period)) {
                score += 30;
            }
        }

        // Teacher preferences
        if (teacher.preferences && teacher.preferences.morning_preference && this.isMorningPeriod(periodId)) {
            score += 20;
        }

        return score;
    }

    isMorningPeriod(period) {
        // Assuming morning ends at 12:00
        return period.start_time < '12:00';
    }

    countTeacherDailyLessons(teacherId, day, timetable) {
        let count = 0;
        this.appState.periods.forEach(period => {
            if (period.type === 'lesson') {
                for (const classId in timetable[day][period.id]) {
                    if (timetable[day][period.id][classId].teacher_id === teacherId) {
                        count++;
                    }
                }
            }
        });
        return count;
    }

    assignLesson(timetable, assignment) {
        const { day, period_id, class_id, teacher_id, subject_id } = assignment;
        
        timetable[day][period_id][class_id].subject_id = subject_id;
        timetable[day][period_id][class_id].teacher_id = teacher_id;
    }

    initializeTeacherLoad() {
        const load = {};
        this.appState.teachers.forEach(teacher => {
            load[teacher.id] = 0;
        });
        return load;
    }

    initializeClassLoad() {
        const load = {};
        this.appState.classes.forEach(cls => {
            load[cls.id] = {};
            this.days.forEach(day => {
                load[cls.id][day] = 0;
            });
        });
        return load;
    }

    async optimizeTimetable(timetable) {
        // Implement optimization algorithms here
        await this.resolveConflicts(timetable);
        await this.balanceWorkload(timetable);
    }

    async resolveConflicts(timetable) {
        // Conflict resolution logic
        let conflictsResolved = 0;
        const maxIterations = 100;

        for (let i = 0; i < maxIterations; i++) {
            const conflict = this.findConflict(timetable);
            if (!conflict) break;

            if (await this.resolveConflict(conflict, timetable)) {
                conflictsResolved++;
            }
        }

        console.log(`Resolved ${conflictsResolved} conflicts`);
    }

    findConflict(timetable) {
        // Implementation to find timetable conflicts
        return null;
    }

    async resolveConflict(conflict, timetable) {
        // Implementation to resolve specific conflicts
        return true;
    }

    async balanceWorkload(timetable) {
        // Implementation to balance teacher and class workload
    }

    updateProgress(lessonSlots) {
        const assigned = lessonSlots.filter(slot => slot.assigned).length;
        const total = lessonSlots.length;
        const percentage = Math.round((assigned / total) * 100);

        // Update progress in UI
        const progressElement = document.getElementById('generation-progress');
        if (progressElement) {
            progressElement.textContent = `Generating... ${percentage}%`;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Manual editing functions
    moveLesson(timetable, from, to) {
        const { day: fromDay, period_id: fromPeriod, class_id: fromClass } = from;
        const { day: toDay, period_id: toPeriod, class_id: toClass } = to;

        const fromSlot = timetable[fromDay][fromPeriod][fromClass];
        const toSlot = timetable[toDay][toPeriod][toClass];

        // Check if move is valid
        if (toSlot.is_break || toSlot.subject_id) {
            return { success: false, message: 'Target slot is not available' };
        }

        if (!this.isTeacherAvailableById(fromSlot.teacher_id, toDay, toPeriod, timetable, fromClass)) {
            return { success: false, message: 'Teacher not available in target slot' };
        }

        // Perform the move
        toSlot.subject_id = fromSlot.subject_id;
        toSlot.teacher_id = fromSlot.teacher_id;
        toSlot.room_id = fromSlot.room_id;

        fromSlot.subject_id = null;
        fromSlot.teacher_id = null;
        fromSlot.room_id = null;

        return { success: true, message: 'Lesson moved successfully' };
    }

    isTeacherAvailableById(teacherId, day, periodId, timetable, excludeClassId = null) {
        for (const classId in timetable[day][periodId]) {
            if (classId === excludeClassId) continue;
            
            const slot = timetable[day][periodId][classId];
            if (slot.teacher_id === teacherId) {
                return false;
            }
        }
        return true;
    }
}

export default TimetableGenerator;