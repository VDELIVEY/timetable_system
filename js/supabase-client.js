// Supabase configuration and client initialization
const SUPABASE_URL = 'https://ocpaxblqmguqbhxajkfn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jcGF4YmxxbWd1cWJoeGFqa2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwOTU5MDIsImV4cCI6MjA3OTY3MTkwMn0.jWv5X2rISM3snCKyuR-SzWEb2fM8LahF1wp85HaNDwc';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Database schema
const DB_SCHEMA = {
    periods: 'periods',
    subjects: 'subjects',
    classes: 'classes',
    teachers: 'teachers',
    timetable: 'timetable_entries',
    constraints: 'constraints',
    exports: 'export_history'
};

// Data management functions
const DataManager = {
    // Load all data from Supabase
    async loadAllData() {
        try {
            const [periods, subjects, classes, teachers, constraints, timetable] = await Promise.all([
                this.loadPeriods(),
                this.loadSubjects(),
                this.loadClasses(),
                this.loadTeachers(),
                this.loadConstraints(),
                this.loadTimetable()
            ]);

            return {
                periods: periods || [],
                subjects: subjects || [],
                classes: classes || [],
                teachers: teachers || [],
                constraints: constraints || this.getDefaultConstraints(),
                timetable: timetable || {}
            };
        } catch (error) {
            console.error('Error loading data:', error);
            return this.getDefaultData();
        }
    },

    // Load periods
    async loadPeriods() {
        const { data, error } = await supabase
            .from(DB_SCHEMA.periods)
            .select('*')
            .order('start_time', { ascending: true });
        
        if (error) throw error;
        return data;
    },

    // Load subjects
    async loadSubjects() {
        const { data, error } = await supabase
            .from(DB_SCHEMA.subjects)
            .select('*')
            .order('name');
        
        if (error) throw error;
        return data;
    },

    // Load classes
    async loadClasses() {
        const { data, error } = await supabase
            .from(DB_SCHEMA.classes)
            .select('*')
            .order('level, stream');
        
        if (error) throw error;
        return data;
    },

    // Load teachers
    async loadTeachers() {
        const { data, error } = await supabase
            .from(DB_SCHEMA.teachers)
            .select('*')
            .order('name');
        
        if (error) throw error;
        return data;
    },

    // Load constraints
    async loadConstraints() {
        const { data, error } = await supabase
            .from(DB_SCHEMA.constraints)
            .select('*')
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                // No constraints found, return defaults
                return this.getDefaultConstraints();
            }
            throw error;
        }
        return data;
    },

    // Load timetable
    async loadTimetable() {
        const { data, error } = await supabase
            .from(DB_SCHEMA.timetable)
            .select('*');
        
        if (error) throw error;
        
        // Convert array to object structure for easier access
        const timetable = {};
        data.forEach(entry => {
            if (!timetable[entry.day]) timetable[entry.day] = {};
            if (!timetable[entry.day][entry.period_id]) timetable[entry.day][entry.period_id] = {};
            timetable[entry.day][entry.period_id][entry.class_id] = entry;
        });
        
        return timetable;
    },

    // Save all data to Supabase
    async saveAllData(data) {
        try {
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
            return false;
        }
    },

    // Individual save functions
    async savePeriods(periods) {
        const { error } = await supabase
            .from(DB_SCHEMA.periods)
            .upsert(periods);
        if (error) throw error;
    },

    async saveSubjects(subjects) {
        const { error } = await supabase
            .from(DB_SCHEMA.subjects)
            .upsert(subjects);
        if (error) throw error;
    },

    async saveClasses(classes) {
        const { error } = await supabase
            .from(DB_SCHEMA.classes)
            .upsert(classes);
        if (error) throw error;
    },

    async saveTeachers(teachers) {
        const { error } = await supabase
            .from(DB_SCHEMA.teachers)
            .upsert(teachers);
        if (error) throw error;
    },

    async saveConstraints(constraints) {
        const { error } = await supabase
            .from(DB_SCHEMA.constraints)
            .upsert(constraints);
        if (error) throw error;
    },

    async saveTimetable(timetable) {
        // Convert timetable object to array
        const entries = [];
        Object.keys(timetable).forEach(day => {
            Object.keys(timetable[day]).forEach(periodId => {
                Object.keys(timetable[day][periodId]).forEach(classId => {
                    entries.push(timetable[day][periodId][classId]);
                });
            });
        });

        const { error } = await supabase
            .from(DB_SCHEMA.timetable)
            .upsert(entries);
        if (error) throw error;
    },

    // Default data structure
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