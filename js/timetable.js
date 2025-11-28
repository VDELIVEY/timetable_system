import { DataManager } from './supabase-client.js';
import ErrorHandler from './error-handler.js';

class TimetableGenerator {
    constructor(appState) {
        this.appState = appState;
        this.days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        this.analytics = {
            generationAttempts: 0,
            successRate: 0,
            averageTime: 0,
            conflictsResolved: 0
        };
        this.isGenerating = false;
        this.generationCancelled = false;
    }

    async generate() {
        if (this.isGenerating) {
            throw new Error('Generation already in progress');
        }

        console.log('Starting timetable generation...');
        this.isGenerating = true;
        this.generationCancelled = false;
        this.analytics.generationAttempts++;
        const startTime = Date.now();
        
        try {
            if (!this.validateData()) {
                throw new Error('Invalid data. Please check your setup.');
            }

            const timetable = this.initializeTimetable();
            this.placeFixedElements(timetable);
            const lessonSlots = this.createLessonSlots();
            await this.assignLessons(timetable, lessonSlots);
            
            if (this.generationCancelled) {
                throw new Error('Generation cancelled by user');
            }
            
            await this.optimizeTimetable(timetable);

            const validation = this.validateTimetable(timetable);
            if (!validation.isValid) {
                console.warn('Timetable validation warnings:', validation.warnings);
            }

            const endTime = Date.now();
            this.analytics.averageTime = (this.analytics.averageTime * (this.analytics.generationAttempts - 1) + (endTime - startTime)) / this.analytics.generationAttempts;
            this.analytics.successRate = (this.analytics.successRate * (this.analytics.generationAttempts - 1) + 1) / this.analytics.generationAttempts;

            this.trackGenerationAnalytics(true, endTime - startTime, validation.warnings.length);

            return timetable;

        } catch (error) {
            this.analytics.successRate = (this.analytics.successRate * (this.analytics.generationAttempts - 1)) / this.analytics.generationAttempts;
            this.trackGenerationAnalytics(false, Date.now() - startTime, 0);
            throw error;
        } finally {
            this.isGenerating = false;
        }
    }

    cancelGeneration() {
        this.generationCancelled = true;
    }

    trackGenerationAnalytics(success, duration, warningCount) {
        const analytics = JSON.parse(localStorage.getItem('timetable_analytics') || '{"generations":[]}');
        analytics.generations.push({
            timestamp: new Date().toISOString(),
            success: success,
            duration: duration,
            warningCount: warningCount,
            teachers: this.appState.teachers.length,
            classes: this.appState.classes.length,
            subjects: this.appState.subjects.length
        });
        
        if (analytics.generations.length > 100) {
            analytics.generations = analytics.generations.slice(-100);
        }
        
        localStorage.setItem('timetable_analytics', JSON.stringify(analytics));
    }

    validateData() {
        const { periods, subjects, classes, teachers } = this.appState;
        
        if (periods.length === 0) {
            ErrorHandler.showNotification('Please set up school periods first.', 'error');
            return false;
        }
        
        if (subjects.length === 0) {
            ErrorHandler.showNotification('Please add subjects first.', 'error');
            return false;
        }
        
        if (classes.length === 0) {
            ErrorHandler.showNotification('Please add classes and streams first.', 'error');
            return false;
        }
        
        if (teachers.length === 0) {
            ErrorHandler.showNotification('Please add teachers first.', 'error');
            return false;
        }

        // Check if teachers have subjects assigned
        const teachersWithoutSubjects = teachers.filter(t => !t.subjects || t.subjects.length === 0);
        if (teachersWithoutSubjects.length > 0) {
            ErrorHandler.showNotification(`${teachersWithoutSubjects.length} teachers have no subjects assigned.`, 'warning');
        }

        // Check if subjects have teachers available
        const subjectsWithoutTeachers = subjects.filter(subject => {
            return !teachers.some(teacher => 
                teacher.subjects && teacher.subjects.includes(subject.id)
            );
        });
        if (subjectsWithoutTeachers.length > 0) {
            ErrorHandler.showNotification(`${subjectsWithoutTeachers.length} subjects have no teachers available.`, 'warning');
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
        // Place breaks and lunch periods
        this.appState.periods.forEach(period => {
            if (period.type !== 'lesson') {
                this.days.forEach(day => {
                    this.appState.classes.forEach(cls => {
                        timetable[day][period.id][cls.id].is_break = true;
                    });
                });
            }
        });
    }

    createLessonSlots() {
        const lessonSlots = [];
        this.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (period.type === 'lesson') {
                    this.appState.classes.forEach(cls => {
                        lessonSlots.push({
                            day: day,
                            period_id: period.id,
                            class_id: cls.id,
                            assigned: false
                        });
                    });
                }
            });
        });
        return lessonSlots;
    }

    async assignLessons(timetable, lessonSlots) {
        const teacherLoad = this.initializeTeacherLoad();
        const classLoad = this.initializeClassLoad();
        const subjectFrequency = this.initializeSubjectFrequency();
        const maxAttempts = 5;
        let attempt = 0;

        while (attempt < maxAttempts && !this.generationCancelled) {
            let unassignedSlots = [];
            let assignmentsThisAttempt = 0;
            
            // Sort slots by difficulty (classes with more subjects first)
            const sortedSlots = this.sortSlotsByDifficulty(lessonSlots);
            
            for (const slot of sortedSlots) {
                if (slot.assigned) continue;

                const bestAssignment = this.findBestAssignment(slot, timetable, teacherLoad, classLoad, subjectFrequency);
                
                if (bestAssignment) {
                    this.assignLesson(timetable, bestAssignment);
                    slot.assigned = true;
                    teacherLoad[bestAssignment.teacher_id]++;
                    classLoad[bestAssignment.class_id][bestAssignment.day]++;
                    subjectFrequency[bestAssignment.class_id][bestAssignment.subject_id]++;
                    assignmentsThisAttempt++;
                } else {
                    unassignedSlots.push(slot);
                }
                
                this.updateProgress(lessonSlots, attempt + 1, maxAttempts);
                await this.delay(2); // Reduced delay for better performance
            }

            console.log(`Attempt ${attempt + 1}: Assigned ${assignmentsThisAttempt} lessons, ${unassignedSlots.length} remaining`);

            if (unassignedSlots.length === 0) break;
            
            // Reset some unassigned slots for next attempt
            lessonSlots = this.resetSomeSlots(unassignedSlots, attempt, maxAttempts);
            attempt++;
        }

        const finalUnassigned = lessonSlots.filter(s => !s.assigned).length;
        if (finalUnassigned > 0) {
            console.warn(`Could not assign ${finalUnassigned} lessons after ${maxAttempts} attempts`);
            ErrorHandler.showNotification(`${finalUnassigned} lessons could not be assigned. Consider adjusting constraints.`, 'warning');
        }

        this.analytics.conflictsResolved += (maxAttempts - 1);
    }

    sortSlotsByDifficulty(slots) {
        // Calculate difficulty based on class level and available teachers
        return slots.slice().sort((a, b) => {
            const classA = this.appState.classes.find(c => c.id === a.class_id);
            const classB = this.appState.classes.find(c => c.id === b.class_id);
            
            // Higher levels are more difficult (more specialized subjects)
            const levelDiff = this.getClassLevelDifficulty(classB.level) - this.getClassLevelDifficulty(classA.level);
            if (levelDiff !== 0) return levelDiff;
            
            // More available teachers = easier to schedule
            const teachersA = this.getAvailableTeachersForClass(classA.id);
            const teachersB = this.getAvailableTeachersForClass(classB.id);
            return teachersB.length - teachersA.length;
        });
    }

    getClassLevelDifficulty(level) {
        // Assign difficulty based on class level (higher = more difficult)
        const levelMap = {
            'S.1': 1, 'S.2': 2, 'S.3': 3, 'S.4': 4, 'S.5': 5, 'S.6': 6
        };
        return levelMap[level] || 1;
    }

    getAvailableTeachersForClass(classId) {
        const cls = this.appState.classes.find(c => c.id === classId);
        return this.appState.teachers.filter(teacher => 
            teacher.class_levels && teacher.class_levels.includes(cls.level)
        );
    }

    resetSomeSlots(slots, currentAttempt, maxAttempts) {
        // Reset a percentage of slots based on attempt number
        const resetPercentage = 0.3 + (currentAttempt / maxAttempts) * 0.4; // 30% to 70%
        const resetCount = Math.floor(slots.length * resetPercentage);
        
        for (let i = 0; i < resetCount && i < slots.length; i++) {
            slots[i].assigned = false;
        }
        
        return slots;
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

    initializeSubjectFrequency() {
        const frequency = {};
        this.appState.classes.forEach(cls => {
            frequency[cls.id] = {};
            this.appState.subjects.forEach(subject => {
                frequency[cls.id][subject.id] = 0;
            });
        });
        return frequency;
    }

    findBestAssignment(slot, timetable, teacherLoad, classLoad, subjectFrequency) {
        const { day, period_id, class_id } = slot;
        const cls = this.appState.classes.find(c => c.id === class_id);
        
        // Get subjects that need to be scheduled for this class
        const neededSubjects = this.getNeededSubjects(class_id, subjectFrequency);
        if (neededSubjects.length === 0) return null;

        // Get available teachers for this class level
        const availableTeachers = this.appState.teachers.filter(teacher => 
            teacher.class_levels && teacher.class_levels.includes(cls.level)
        );

        // Find best teacher-subject combination
        let bestScore = -1;
        let bestAssignment = null;

        for (const subject of neededSubjects) {
            const teachersForSubject = availableTeachers.filter(teacher => 
                teacher.subjects && teacher.subjects.includes(subject.id)
            );

            for (const teacher of teachersForSubject) {
                if (!this.isTeacherAvailable(teacher.id, day, period_id, timetable)) continue;

                const score = this.calculateAssignmentScore(
                    teacher, subject, teacherLoad, classLoad, class_id, day
                );

                if (score > bestScore) {
                    bestScore = score;
                    bestAssignment = {
                        day: day,
                        period_id: period_id,
                        class_id: class_id,
                        teacher_id: teacher.id,
                        subject_id: subject.id
                    };
                }
            }
        }

        return bestAssignment;
    }

    getNeededSubjects(classId, subjectFrequency) {
        const classSubjects = [];
        
        this.appState.subjects.forEach(subject => {
            const targetLessons = subject.target_lessons_per_week || 5;
            const currentLessons = subjectFrequency[classId][subject.id] || 0;
            
            if (currentLessons < targetLessons) {
                classSubjects.push({
                    subject: subject,
                    priority: targetLessons - currentLessons,
                    current: currentLessons,
                    target: targetLessons
                });
            }
        });

        // Sort by priority (subjects with most remaining lessons first)
        classSubjects.sort((a, b) => b.priority - a.priority);
        return classSubjects.map(item => item.subject);
    }

    calculateAssignmentScore(teacher, subject, teacherLoad, classLoad, classId, day) {
        let score = 100;

        // Prefer teachers with lower current load
        score -= teacherLoad[teacher.id] * 2;

        // Prefer balancing daily class load
        score -= classLoad[classId][day] * 1.5;

        // Consider subject priority
        const priorityWeight = {
            'high': 10,
            'medium': 5,
            'low': 0
        };
        score += priorityWeight[subject.priority] || 0;

        // Prefer morning periods for high priority subjects if constraint is enabled
        if (this.appState.constraints.prefer_morning && subject.priority === 'high') {
            score += 5;
        }

        return Math.max(0, score);
    }

    assignLesson(timetable, assignment) {
        const { day, period_id, class_id, teacher_id, subject_id } = assignment;
        timetable[day][period_id][class_id] = {
            ...timetable[day][period_id][class_id],
            subject_id: subject_id,
            teacher_id: teacher_id,
            is_break: false
        };
    }

    isTeacherAvailable(teacherId, day, periodId, timetable) {
        // Check if teacher is already assigned in this period
        for (const classId in timetable[day][periodId]) {
            if (timetable[day][periodId][classId].teacher_id === teacherId) {
                return false;
            }
        }
        return true;
    }

    isTeacherAvailableById(teacherId, day, periodId, timetable, excludeClassId = null) {
        for (const classId in timetable[day][periodId]) {
            if (classId !== excludeClassId && timetable[day][periodId][classId].teacher_id === teacherId) {
                return false;
            }
        }
        return true;
    }

    updateProgress(lessonSlots, currentAttempt, maxAttempts) {
        const assigned = lessonSlots.filter(slot => slot.assigned).length;
        const total = lessonSlots.length;
        const basePercentage = (assigned / total) * 100;
        const attemptAdjustment = ((currentAttempt - 1) / maxAttempts) * 100;
        const percentage = Math.min(basePercentage + attemptAdjustment, 100);

        const progressElement = document.getElementById('generation-progress');
        const progressFill = document.getElementById('progress-fill');
        const progressPercentage = document.getElementById('progress-percentage');

        if (progressElement && progressFill && progressPercentage) {
            progressElement.style.display = 'block';
            progressFill.style.width = `${percentage}%`;
            progressPercentage.textContent = `${Math.round(percentage)}%`;
        }
    }

    async optimizeTimetable(timetable) {
        if (this.generationCancelled) return;

        console.log('Starting timetable optimization...');
        const conflictsResolved = await this.resolveConflicts(timetable);
        await this.balanceTeacherWorkload(timetable);
        await this.optimizeSubjectDistribution(timetable);
        console.log(`Optimization complete. Resolved ${conflictsResolved} conflicts.`);
    }

    async resolveConflicts(timetable) {
        let conflictsResolved = 0;
        const maxIterations = 100;

        for (let iteration = 0; iteration < maxIterations && !this.generationCancelled; iteration++) {
            const conflicts = this.findAllConflicts(timetable);
            if (conflicts.length === 0) break;

            let resolvedThisIteration = 0;
            for (const conflict of conflicts) {
                if (this.generationCancelled) break;
                if (await this.resolveSpecificConflict(conflict, timetable)) {
                    resolvedThisIteration++;
                    conflictsResolved++;
                }
            }

            console.log(`Iteration ${iteration + 1}: Resolved ${resolvedThisIteration} conflicts`);

            if (resolvedThisIteration === 0) break;
            await this.delay(10);
        }

        console.log(`Total conflicts resolved: ${conflictsResolved}`);
        return conflictsResolved;
    }

    findAllConflicts(timetable) {
        const conflicts = [];

        this.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (period.type !== 'lesson') return;

                const teacherAssignments = {};
                this.appState.classes.forEach(cls => {
                    const slot = timetable[day][period.id][cls.id];
                    if (slot.teacher_id && !slot.is_break) {
                        if (!teacherAssignments[slot.teacher_id]) {
                            teacherAssignments[slot.teacher_id] = [];
                        }
                        teacherAssignments[slot.teacher_id].push({
                            classId: cls.id,
                            slot: slot
                        });
                    }
                });

                Object.keys(teacherAssignments).forEach(teacherId => {
                    if (teacherAssignments[teacherId].length > 1) {
                        conflicts.push({
                            type: 'teacher_double_booking',
                            teacherId: teacherId,
                            day: day,
                            periodId: period.id,
                            assignments: teacherAssignments[teacherId]
                        });
                    }
                });
            });
        });

        return conflicts;
    }

    async resolveSpecificConflict(conflict, timetable) {
        switch (conflict.type) {
            case 'teacher_double_booking':
                return await this.resolveTeacherDoubleBooking(conflict, timetable);
            default:
                return false;
        }
    }

    async resolveTeacherDoubleBooking(conflict, timetable) {
        const { teacherId, day, periodId, assignments } = conflict;
        
        // Try to move each conflicting assignment
        for (const assignment of assignments.slice(1)) {
            const alternativeSlot = this.findAlternativeSlot(assignment.slot, teacherId, timetable);
            if (alternativeSlot) {
                // Move the assignment
                timetable[alternativeSlot.day][alternativeSlot.periodId][assignment.classId] = {
                    ...assignment.slot,
                    day: alternativeSlot.day,
                    period_id: alternativeSlot.periodId
                };
                
                // Clear original slot
                timetable[day][periodId][assignment.classId] = {
                    day: day,
                    period_id: periodId,
                    class_id: assignment.classId,
                    subject_id: null,
                    teacher_id: null,
                    room_id: null,
                    is_break: false
                };
                
                return true;
            }
        }
        
        return false;
    }

    findAlternativeSlot(originalSlot, teacherId, timetable) {
        const { class_id, subject_id } = originalSlot;
        
        // Look for empty slots in the same day first
        for (const day of this.days) {
            for (const period of this.appState.periods) {
                if (period.type !== 'lesson') continue;
                if (day === originalSlot.day && period.id === originalSlot.period_id) continue;
                
                const slot = timetable[day][period.id][class_id];
                if (!slot.subject_id && !slot.is_break && this.isTeacherAvailableById(teacherId, day, period.id, timetable, class_id)) {
                    return { day, periodId: period.id };
                }
            }
        }
        
        return null;
    }

    async balanceTeacherWorkload(timetable) {
        if (this.generationCancelled) return;

        const teacherLoads = this.calculateTeacherLoads(timetable);
        const avgLoad = teacherLoads.reduce((sum, load) => sum + load, 0) / teacherLoads.length;
        
        // Identify overloaded and underloaded teachers
        const overloaded = [];
        const underloaded = [];
        
        this.appState.teachers.forEach(teacher => {
            const load = teacherLoads[teacher.id] || 0;
            if (load > avgLoad + 2) {
                overloaded.push({ teacher, load });
            } else if (load < avgLoad - 2) {
                underloaded.push({ teacher, load });
            }
        });

        // Try to balance loads
        for (const over of overloaded) {
            if (this.generationCancelled) break;
            for (const under of underloaded) {
                if (await this.transferLessons(over.teacher, under.teacher, timetable)) {
                    break;
                }
            }
            await this.delay(5);
        }
    }

    async transferLessons(fromTeacher, toTeacher, timetable) {
        // Find lessons that can be transferred
        for (const day of this.days) {
            for (const period of this.appState.periods) {
                if (period.type !== 'lesson') continue;
                
                for (const classId in timetable[day][period.id]) {
                    const slot = timetable[day][period.id][classId];
                    if (slot.teacher_id === fromTeacher.id && 
                        toTeacher.subjects.includes(slot.subject_id) &&
                        this.isTeacherAvailableById(toTeacher.id, day, period.id, timetable, classId)) {
                        
                        // Transfer the lesson
                        slot.teacher_id = toTeacher.id;
                        return true;
                    }
                }
            }
        }
        return false;
    }

    async optimizeSubjectDistribution(timetable) {
        if (this.generationCancelled) return;

        // Ensure subjects are distributed evenly across the week
        for (const cls of this.appState.classes) {
            const subjectDistribution = this.calculateSubjectDistribution(cls.id, timetable);
            
            for (const subjectId in subjectDistribution) {
                const subject = this.appState.subjects.find(s => s.id === subjectId);
                const targetLessons = subject.target_lessons_per_week || 5;
                const currentLessons = subjectDistribution[subjectId];
                
                if (currentLessons < targetLessons) {
                    await this.addMissingLessons(cls.id, subjectId, targetLessons - currentLessons, timetable);
                }
            }
            await this.delay(5);
        }
    }

    calculateSubjectDistribution(classId, timetable) {
        const distribution = {};
        
        this.appState.subjects.forEach(subject => {
            distribution[subject.id] = 0;
        });

        this.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (period.type === 'lesson') {
                    const slot = timetable[day][period.id][classId];
                    if (slot.subject_id) {
                        distribution[slot.subject_id]++;
                    }
                }
            });
        });

        return distribution;
    }

    async addMissingLessons(classId, subjectId, missingCount, timetable) {
        let added = 0;
        
        for (const day of this.days) {
            for (const period of this.appState.periods) {
                if (period.type !== 'lesson') continue;
                if (added >= missingCount) break;
                
                const slot = timetable[day][period.id][classId];
                if (!slot.subject_id && !slot.is_break) {
                    // Find a teacher for this subject
                    const teacher = this.appState.teachers.find(t => 
                        t.subjects.includes(subjectId) && 
                        t.class_levels.includes(this.appState.classes.find(c => c.id === classId).level) &&
                        this.isTeacherAvailableById(t.id, day, period.id, timetable, classId)
                    );
                    
                    if (teacher) {
                        slot.subject_id = subjectId;
                        slot.teacher_id = teacher.id;
                        added++;
                    }
                }
            }
        }
    }

    validateTimetable(timetable) {
        const warnings = [];
        let isValid = true;

        // Check for unassigned slots
        let unassignedSlots = 0;
        this.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (period.type === 'lesson') {
                    this.appState.classes.forEach(cls => {
                        const slot = timetable[day][period.id][cls.id];
                        if (!slot.subject_id && !slot.is_break) {
                            unassignedSlots++;
                        }
                    });
                }
            });
        });

        if (unassignedSlots > 0) {
            warnings.push(`${unassignedSlots} lesson slots could not be assigned`);
            isValid = false;
        }

        // Check teacher workload balance
        const teacherLoads = this.calculateTeacherLoads(timetable);
        const avgLoad = teacherLoads.reduce((sum, load) => sum + load, 0) / Object.keys(teacherLoads).length;
        const unbalancedTeachers = Object.values(teacherLoads).filter(load => Math.abs(load - avgLoad) > 3);
        
        if (unbalancedTeachers.length > 0) {
            warnings.push(`${unbalancedTeachers.length} teachers have unbalanced workload`);
        }

        // Check subject distribution
        this.appState.classes.forEach(cls => {
            const distribution = this.calculateSubjectDistribution(cls.id, timetable);
            this.appState.subjects.forEach(subject => {
                const target = subject.target_lessons_per_week || 5;
                const actual = distribution[subject.id] || 0;
                if (Math.abs(actual - target) > 2) {
                    warnings.push(`Class ${cls.level} ${cls.stream}: ${subject.name} has ${actual} lessons (target: ${target})`);
                }
            });
        });

        return { isValid, warnings };
    }

    calculateTeacherLoads(timetable) {
        const loads = {};
        
        this.appState.teachers.forEach(teacher => {
            loads[teacher.id] = 0;
        });

        this.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (period.type === 'lesson') {
                    for (const classId in timetable[day][period.id]) {
                        const teacherId = timetable[day][period.id][classId].teacher_id;
                        if (teacherId) {
                            loads[teacherId]++;
                        }
                    }
                }
            });
        });

        return loads;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    moveLesson(timetable, from, to) {
        const { day: fromDay, period_id: fromPeriod, class_id: fromClass } = from;
        const { day: toDay, period_id: toPeriod, class_id: toClass } = to;

        const fromSlot = timetable[fromDay][fromPeriod][fromClass];
        const toSlot = timetable[toDay][toPeriod][toClass];

        if (toSlot.is_break) {
            return { success: false, message: 'Cannot move lesson to break period' };
        }

        if (toSlot.subject_id) {
            return { success: false, message: 'Target slot is already occupied' };
        }

        if (!this.isTeacherAvailableById(fromSlot.teacher_id, toDay, toPeriod, timetable, fromClass)) {
            return { success: false, message: 'Teacher not available in target slot' };
        }

        toSlot.subject_id = fromSlot.subject_id;
        toSlot.teacher_id = fromSlot.teacher_id;
        toSlot.room_id = fromSlot.room_id;

        fromSlot.subject_id = null;
        fromSlot.teacher_id = null;
        fromSlot.room_id = null;

        this.notifyCollaborators({
            type: 'lesson_moved',
            from: { day: fromDay, period: fromPeriod, class: fromClass },
            to: { day: toDay, period: toPeriod, class: toClass },
            timestamp: new Date().toISOString()
        });

        return { success: true, message: 'Lesson moved successfully' };
    }

    notifyCollaborators(change) {
        if (this.appState.collaboration?.enabled) {
            console.log('Notifying collaborators:', change);
        }
    }
}

export default TimetableGenerator;