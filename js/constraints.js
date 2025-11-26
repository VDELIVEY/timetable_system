class ConstraintManager {
    constructor(appState) {
        this.appState = appState;
    }

    // Validate all constraints
    validateAllConstraints() {
        const errors = [];

        // Check teacher availability
        errors.push(...this.validateTeacherConstraints());

        // Check subject requirements
        errors.push(...this.validateSubjectConstraints());

        // Check class requirements
        errors.push(...this.validateClassConstraints());

        // Check period availability
        errors.push(...this.validatePeriodConstraints());

        return errors;
    }

    validateTeacherConstraints() {
        const errors = [];
        const { teachers, classes, subjects } = this.appState;

        teachers.forEach(teacher => {
            // Check if teacher has subjects assigned
            if (!teacher.subjects || teacher.subjects.length === 0) {
                errors.push(`Teacher ${teacher.name} has no subjects assigned`);
                return;
            }

            // Check if teacher's subjects exist
            teacher.subjects.forEach(subjectId => {
                const subject = subjects.find(s => s.id === subjectId);
                if (!subject) {
                    errors.push(`Teacher ${teacher.name} has invalid subject assigned: ${subjectId}`);
                }
            });

            // Check if teacher can teach assigned class levels
            if (teacher.class_levels && teacher.class_levels.length > 0) {
                const availableLevels = new Set(classes.map(c => c.level));
                teacher.class_levels.forEach(level => {
                    if (!availableLevels.has(level)) {
                        errors.push(`Teacher ${teacher.name} assigned to non-existent class level: ${level}`);
                    }
                });
            }
        });

        return errors;
    }

    validateSubjectConstraints() {
        const errors = [];
        const { subjects, classes, periods } = this.appState;

        // Calculate total available lesson periods per week
        const lessonPeriodsPerDay = periods.filter(p => p.type === 'lesson').length;
        const totalLessonPeriodsPerWeek = lessonPeriodsPerDay * 5; // 5 days

        subjects.forEach(subject => {
            const targetLessons = subject.target_lessons_per_week || 0;

            // Check if target lessons is reasonable
            if (targetLessons > totalLessonPeriodsPerWeek) {
                errors.push(`Subject ${subject.name} requires more lessons (${targetLessons}) than available periods (${totalLessonPeriodsPerWeek})`);
            }

            // Check if there are enough teachers for this subject
            const subjectTeachers = this.appState.teachers.filter(t => 
                t.subjects && t.subjects.includes(subject.id)
            );

            if (subjectTeachers.length === 0) {
                errors.push(`No teachers available for subject: ${subject.name}`);
            }
        });

        return errors;
    }

    validateClassConstraints() {
        const errors = [];
        const { classes, subjects, periods } = this.appState;

        const lessonPeriodsPerDay = periods.filter(p => p.type === 'lesson').length;
        const totalAvailableSlots = classes.length * lessonPeriodsPerDay * 5;

        // Calculate total required lessons
        let totalRequiredLessons = 0;
        classes.forEach(cls => {
            subjects.forEach(subject => {
                totalRequiredLessons += subject.target_lessons_per_week || 0;
            });
        });

        if (totalRequiredLessons > totalAvailableSlots) {
            errors.push(`Total required lessons (${totalRequiredLessons}) exceed available slots (${totalAvailableSlots})`);
        }

        return errors;
    }

    validatePeriodConstraints() {
        const errors = [];
        const { periods } = this.appState;

        // Check for overlapping periods
        for (let i = 0; i < periods.length; i++) {
            for (let j = i + 1; j < periods.length; j++) {
                if (this.doPeriodsOverlap(periods[i], periods[j])) {
                    errors.push(`Periods ${periods[i].name} and ${periods[j].name} overlap`);
                }
            }
        }

        return errors;
    }

    doPeriodsOverlap(period1, period2) {
        if (period1.type !== 'lesson' || period2.type !== 'lesson') return false;

        const start1 = this.timeToMinutes(period1.start_time);
        const end1 = this.timeToMinutes(period1.end_time);
        const start2 = this.timeToMinutes(period2.start_time);
        const end2 = this.timeToMinutes(period2.end_time);

        return start1 < end2 && start2 < end1;
    }

    timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // Check hard constraints during manual editing
    checkHardConstraints(proposedChange, timetable) {
        const violations = [];

        // Check for teacher double-booking
        if (this.isTeacherDoubleBooked(proposedChange, timetable)) {
            violations.push('Teacher is already assigned in this period');
        }

        // Check for room double-booking (if rooms are implemented)
        if (this.isRoomDoubleBooked(proposedChange, timetable)) {
            violations.push('Room is already occupied in this period');
        }

        // Check if period is a break/lunch
        if (this.isBreakPeriod(proposedChange)) {
            violations.push('Cannot schedule lessons during break/lunch periods');
        }

        return violations;
    }

    isTeacherDoubleBooked(proposedChange, timetable) {
        const { day, period_id, teacher_id, class_id } = proposedChange;

        if (!teacher_id) return false;

        for (const cid in timetable[day][period_id]) {
            if (cid !== class_id && timetable[day][period_id][cid].teacher_id === teacher_id) {
                return true;
            }
        }

        return false;
    }

    isRoomDoubleBooked(proposedChange, timetable) {
        // Implement when rooms are added
        return false;
    }

    isBreakPeriod(proposedChange) {
        const period = this.appState.periods.find(p => p.id === proposedChange.period_id);
        return period && period.type !== 'lesson';
    }

    // Calculate soft constraint scores for optimization
    calculateSoftConstraintScores(timetable) {
        let totalScore = 1000; // Start with perfect score

        // Deduct for subject frequency violations
        totalScore -= this.calculateSubjectFrequencyPenalty(timetable) * 10;

        // Deduct for teacher preference violations
        totalScore -= this.calculateTeacherPreferencePenalty(timetable) * 5;

        // Deduct for workload imbalance
        totalScore -= this.calculateWorkloadImbalancePenalty(timetable) * 3;

        // Add bonus for meeting all constraints
        if (totalScore > 950) {
            totalScore += 50;
        }

        return Math.max(0, totalScore);
    }

    calculateSubjectFrequencyPenalty(timetable) {
        let penalty = 0;

        this.appState.classes.forEach(cls => {
            this.appState.subjects.forEach(subject => {
                const actualLessons = this.countSubjectLessons(cls.id, subject.id, timetable);
                const targetLessons = subject.target_lessons_per_week || 0;
                const difference = Math.abs(actualLessons - targetLessons);
                
                penalty += difference * (subject.priority === 'high' ? 2 : 1);
            });
        });

        return penalty;
    }

    countSubjectLessons(classId, subjectId, timetable) {
        let count = 0;
        this.appState.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (period.type === 'lesson') {
                    const slot = timetable[day][period.id][classId];
                    if (slot.subject_id === subjectId) {
                        count++;
                    }
                }
            });
        });
        return count;
    }

    calculateTeacherPreferencePenalty(timetable) {
        let penalty = 0;

        this.appState.teachers.forEach(teacher => {
            if (teacher.preferences) {
                // Check morning/afternoon preferences
                if (teacher.preferences.morning_preference) {
                    penalty += this.countAfternoonLessons(teacher.id, timetable);
                }

                // Check maximum daily lessons
                this.appState.days.forEach(day => {
                    const dailyLessons = this.countTeacherDailyLessons(teacher.id, day, timetable);
                    if (dailyLessons > this.appState.constraints.max_daily_lessons) {
                        penalty += (dailyLessons - this.appState.constraints.max_daily_lessons) * 5;
                    }
                });
            }
        });

        return penalty;
    }

    countAfternoonLessons(teacherId, timetable) {
        let count = 0;
        this.appState.days.forEach(day => {
            this.appState.periods.forEach(period => {
                if (this.isAfternoonPeriod(period)) {
                    for (const classId in timetable[day][period.id]) {
                        if (timetable[day][period.id][classId].teacher_id === teacherId) {
                            count++;
                        }
                    }
                }
            });
        });
        return count;
    }

    isAfternoonPeriod(period) {
        return period.start_time >= '12:00';
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

    calculateWorkloadImbalancePenalty(timetable) {
        const teacherLoads = this.calculateTeacherLoads(timetable);
        const avgLoad = teacherLoads.reduce((sum, load) => sum + load, 0) / teacherLoads.length;
        
        let imbalance = 0;
        teacherLoads.forEach(load => {
            imbalance += Math.abs(load - avgLoad);
        });

        return imbalance;
    }

    calculateTeacherLoads(timetable) {
        const loads = {};
        
        this.appState.teachers.forEach(teacher => {
            loads[teacher.id] = 0;
        });

        this.appState.days.forEach(day => {
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

        return Object.values(loads);
    }
}

export default ConstraintManager;