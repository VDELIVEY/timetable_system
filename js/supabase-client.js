const SUPABASE_URL = 'https://ocpaxblqmguqbhxajkfn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jcGF4YmxxbWd1cWJoeGFqa2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwOTU5MDIsImV4cCI6MjA3OTY3MTkwMn0.jWv5X2rISM3snCKyuR-SzWEb2fM8LahF1wp85HaNDwc';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DB_SCHEMA = {
    periods: 'periods',
    subjects: 'subjects',
    classes: 'classes',
    teachers: 'teachers',
    timetable: 'timetable_entries',
    constraints: 'constraints',
    exports: 'export_history'
};

const DataManager = {
    // Delete operations
    async deletePeriod(id) {
        try {
            const { error } = await supabase
                .from(DB_SCHEMA.periods)
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting period:', error);
            throw error;
        }
    },

    async deleteSubject(id) {
        try {
            const { error } = await supabase
                .from(DB_SCHEMA.subjects)
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting subject:', error);
            throw error;
        }
    },

    async deleteClass(id) {
        try {
            const { error } = await supabase
                .from(DB_SCHEMA.classes)
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting class:', error);
            throw error;
        }
    },

    async deleteTeacher(id) {
        try {
            const { error } = await supabase
                .from(DB_SCHEMA.teachers)
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting teacher:', error);
            throw error;
        }
    },
    async testConnection() {
        try {
            console.log('🧪 Testing Supabase connection...');

            // Test with a simple query to periods table
            const { data, error } = await supabase
                .from('periods')
                .select('id')
                .limit(1);

            if (error) {
                console.log('❌ Supabase connection failed:', error);
                return false;
            }

            console.log('✅ Supabase connection successful');
            return true;

        } catch (error) {
            console.log('💥 Connection test error:', error);
            return false;
        }
    },

    async loadAllData() {
        try {
            // Test connection first
            const isConnected = await this.testConnection();

            if (!isConnected) {
                console.log('🔄 Using local storage due to connection issues');
                const backup = this.loadFromBackup();
                return backup || this.getDefaultData();
            }

            console.log('📥 Loading data from Supabase...');
            const [periods, subjects, classes, teachers, constraints, timetable] = await Promise.all([
                this.loadPeriods(),
                this.loadSubjects(),
                this.loadClasses(),
                this.loadTeachers(),
                this.loadConstraints(),
                this.loadTimetable()
            ]);

            const allData = {
                periods: periods || [],
                subjects: subjects || [],
                classes: classes || [],
                teachers: teachers || [],
                constraints: constraints || this.getDefaultConstraints(),
                timetable: timetable || {}
            };

            console.log('✅ All data loaded successfully');
            return allData;

        } catch (error) {
            console.error('💥 Error loading data:', error);
            const backup = this.loadFromBackup();
            if (backup) {
                console.log('🔄 Restored from backup');
                return backup;
            }
            console.log('🔄 Using default data');
            return this.getDefaultData();
        }
    },
    async loadPeriods() {
        try {
            const { data, error } = await supabase
                .from(DB_SCHEMA.periods)
                .select('*')
                .order('start_time', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error loading periods:', error);
            throw error;
        }
    },

    async loadSubjects() {
        try {
            const { data, error } = await supabase
                .from(DB_SCHEMA.subjects)
                .select('*')
                .order('name');

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error loading subjects:', error);
            throw error;
        }
    },

    async loadClasses() {
        try {
            const { data, error } = await supabase
                .from(DB_SCHEMA.classes)
                .select('*')
                .order('level, stream');

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error loading classes:', error);
            throw error;
        }
    },

    async loadTeachers() {
        try {
            const { data, error } = await supabase
                .from(DB_SCHEMA.teachers)
                .select('*')
                .order('name');

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error loading teachers:', error);
            throw error;
        }
    },

    async loadConstraints() {
        try {
            console.log('🔧 Loading constraints from Supabase...');

            const { data, error } = await supabase
                .from(DB_SCHEMA.constraints)
                .select('*')
                .limit(1)
                .single();

            if (error) {
                console.log('❌ Constraints error:', error);
                console.log('🔄 Using default constraints');
                return this.getDefaultConstraints();
            }

            console.log('✅ Constraints loaded:', data);
            return data || this.getDefaultConstraints();

        } catch (error) {
            console.error('💥 Constraints load failed:', error);
            return this.getDefaultConstraints();
        }
    },

    async loadTimetable() {
        try {
            const { data, error } = await supabase
                .from(DB_SCHEMA.timetable)
                .select('*');

            if (error) throw error;

            const timetable = {};
            if (data && data.length > 0) {
                data.forEach(entry => {
                    if (!timetable[entry.day]) timetable[entry.day] = {};
                    if (!timetable[entry.day][entry.period_id]) timetable[entry.day][entry.period_id] = {};
                    timetable[entry.day][entry.period_id][entry.class_id] = entry;
                });
            }

            return timetable;
        } catch (error) {
            console.error('Error loading timetable:', error);
            return {};
        }
    },

    async saveAllData(data) {
        try {
            this.createBackup(data);

            await Promise.all([
                this.savePeriods(data.periods),
                this.saveSubjects(data.subjects),
                this.saveClasses(data.classes),
                this.saveTeachers(data.teachers),
                this.saveConstraints(data.constraints),
                this.saveTimetable(data.timetable)
            ]);
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            const backup = this.loadFromBackup();
            if (backup) {
                console.log('Restored from backup after save failure');
            }
            return false;
        }
    },

    async savePeriods(periods) {
        if (!periods || periods.length === 0) return;

        try {
            const periodsToSave = periods.map(period => {
                const { id, created_at, ...periodData } = period;
                return periodData;
            });

            const { error } = await supabase
                .from(DB_SCHEMA.periods)
                .upsert(periodsToSave, { onConflict: 'id' });
            if (error) throw error;
        } catch (error) {
            console.error('Error saving periods:', error);
            throw error;
        }
    },

    async saveSubjects(subjects) {
        if (!subjects || subjects.length === 0) return;

        try {
            const subjectsToSave = subjects.map(subject => {
                const { id, created_at, ...subjectData } = subject;
                return subjectData;
            });

            const { error } = await supabase
                .from(DB_SCHEMA.subjects)
                .upsert(subjectsToSave, { onConflict: 'id' });
            if (error) throw error;
        } catch (error) {
            console.error('Error saving subjects:', error);
            throw error;
        }
    },

    async saveClasses(classes) {
        if (!classes || classes.length === 0) return;

        try {
            const classesToSave = classes.map(cls => {
                const { id, created_at, ...classData } = cls;
                return classData;
            });

            const { error } = await supabase
                .from(DB_SCHEMA.classes)
                .upsert(classesToSave, { onConflict: 'id' });
            if (error) throw error;
        } catch (error) {
            console.error('Error saving classes:', error);
            throw error;
        }
    },

    async saveTeachers(teachers) {
        if (!teachers || teachers.length === 0) return;

        try {
            const teachersToSave = teachers.map(teacher => {
                const { id, created_at, ...teacherData } = teacher;
                return teacherData;
            });

            const { error } = await supabase
                .from(DB_SCHEMA.teachers)
                .upsert(teachersToSave, { onConflict: 'id' });
            if (error) throw error;
        } catch (error) {
            console.error('Error saving teachers:', error);
            throw error;
        }
    },

    async saveConstraints(constraints) {
        if (!constraints) return;

        try {
            const constraintsToSave = { ...constraints };
            delete constraintsToSave.id;
            delete constraintsToSave.created_at;

            const { error } = await supabase
                .from(DB_SCHEMA.constraints)
                .upsert(constraintsToSave, { onConflict: 'id' });
            if (error) throw error;
        } catch (error) {
            console.error('Error saving constraints:', error);
            throw error;
        }
    },

    async saveTimetable(timetable) {
        if (!timetable || typeof timetable !== 'object') return;

        try {
            const entries = [];

            Object.keys(timetable).forEach(day => {
                Object.keys(timetable[day]).forEach(periodId => {
                    Object.keys(timetable[day][periodId]).forEach(classId => {
                        const entry = timetable[day][periodId][classId];
                        if (entry && (entry.subject_id || entry.is_break)) {
                            const { id, created_at, ...entryData } = entry;
                            entries.push(entryData);
                        }
                    });
                });
            });

            if (entries.length > 0) {
                // First clear existing timetable entries
                const { error: deleteError } = await supabase
                    .from(DB_SCHEMA.timetable)
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all entries

                if (deleteError) throw deleteError;

                // Then insert new entries
                const { error: insertError } = await supabase
                    .from(DB_SCHEMA.timetable)
                    .insert(entries);

                if (insertError) throw insertError;
            }
        } catch (error) {
            console.error('Error saving timetable:', error);
            throw error;
        }
    },

    async saveExportHistory(exportRecord) {
        try {
            const { error } = await supabase
                .from(DB_SCHEMA.exports)
                .insert(exportRecord);
            if (error) throw error;
        } catch (error) {
            console.error('Error saving export history:', error);
            throw error;
        }
    },

    createBackup(data) {
        try {
            const backup = {
                data: JSON.parse(JSON.stringify(data)),
                timestamp: new Date().toISOString(),
                version: '1.0'
            };
            localStorage.setItem('timetable_backup', JSON.stringify(backup));

            const backupHistory = JSON.parse(localStorage.getItem('backup_history') || '[]');
            backupHistory.unshift(backup);
            if (backupHistory.length > 5) {
                backupHistory.splice(5);
            }
            localStorage.setItem('backup_history', JSON.stringify(backupHistory));
        } catch (error) {
            console.error('Backup creation failed:', error);
        }
    },

    loadFromBackup() {
        try {
            const backup = localStorage.getItem('timetable_backup');
            if (backup) {
                const parsed = JSON.parse(backup);
                return parsed.data;
            }
        } catch (error) {
            console.error('Backup restore failed:', error);
        }
        return null;
    },

    getBackupHistory() {
        try {
            return JSON.parse(localStorage.getItem('backup_history') || '[]');
        } catch (error) {
            console.error('Error getting backup history:', error);
            return [];
        }
    },

    restoreBackup(backupIndex = 0) {
        try {
            const backupHistory = this.getBackupHistory();
            if (backupHistory[backupIndex]) {
                return backupHistory[backupIndex].data;
            }
        } catch (error) {
            console.error('Backup restoration failed:', error);
        }
        return null;
    },

    exportToJSON(data) {
        try {
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                data: data
            };
            return JSON.stringify(exportData, null, 2);
        } catch (error) {
            console.error('Error exporting to JSON:', error);
            throw error;
        }
    },

    importFromJSON(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            if (imported.data && imported.version === '1.0') {
                return imported.data;
            } else {
                throw new Error('Invalid file format or version');
            }
        } catch (error) {
            console.error('Error importing from JSON:', error);
            throw new Error('Failed to import data: ' + error.message);
        }
    },

    getDefaultData() {
        return {
            periods: [],
            subjects: [],
            classes: [],
            teachers: [],
            constraints: this.getDefaultConstraints(),
            timetable: {}
        };
    },

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
};

export { supabase, DataManager, DB_SCHEMA };