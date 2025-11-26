import { DataManager } from './supabase-client.js';

class ExportManager {
    constructor(appState) {
        this.appState = appState;
    }

    // Export timetables based on type and format
    async exportTimetables(type, format, selectedItems = []) {
        try {
            let data;
            let filename;

            switch (type) {
                case 'teachers':
                    data = await this.prepareTeacherTimetables(selectedItems);
                    filename = 'teacher_timetables';
                    break;
                case 'classes':
                    data = await this.prepareClassTimetables(selectedItems);
                    filename = 'class_timetables';
                    break;
                case 'streams':
                    data = await this.prepareStreamTimetables(selectedItems);
                    filename = 'stream_timetables';
                    break;
                default:
                    throw new Error('Invalid export type');
            }

            switch (format) {
                case 'excel':
                    return await this.exportToExcel(data, filename);
                case 'word':
                    return await this.exportToWord(data, filename);
                case 'pdf':
                    return await this.exportToPDF(data, filename);
                default:
                    throw new Error('Invalid export format');
            }
        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    }

    async prepareTeacherTimetables(selectedTeacherIds = []) {
        const teachers = selectedTeacherIds.length > 0 
            ? this.appState.teachers.filter(t => selectedTeacherIds.includes(t.id))
            : this.appState.teachers;

        const teacherTimetables = {};

        teachers.forEach(teacher => {
            teacherTimetables[teacher.name] = this.generateTeacherTimetable(teacher.id);
        });

        return teacherTimetables;
    }

    generateTeacherTimetable(teacherId) {
        const timetable = {};
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        days.forEach(day => {
            timetable[day] = {};
            this.appState.periods.forEach(period => {
                let lessonInfo = 'Free';
                
                // Find where this teacher is teaching in this period
                for (const classId in this.appState.timetable[day]?.[period.id] || {}) {
                    const slot = this.appState.timetable[day][period.id][classId];
                    if (slot.teacher_id === teacherId) {
                        const subject = this.appState.subjects.find(s => s.id === slot.subject_id);
                        const cls = this.appState.classes.find(c => c.id === slot.class_id);
                        lessonInfo = `${subject?.name || 'Unknown'} - ${cls?.level || ''} ${cls?.stream || ''}`;
                        break;
                    }
                }

                timetable[day][period.name] = lessonInfo;
            });
        });

        return timetable;
    }

    async prepareClassTimetables(selectedClassIds = []) {
        const classes = selectedClassIds.length > 0
            ? this.appState.classes.filter(c => selectedClassIds.includes(c.id))
            : this.appState.classes;

        const classTimetables = {};

        classes.forEach(cls => {
            const className = `${cls.level} ${cls.stream}`;
            classTimetables[className] = this.generateClassTimetable(cls.id);
        });

        return classTimetables;
    }

    generateClassTimetable(classId) {
        const timetable = {};
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        days.forEach(day => {
            timetable[day] = {};
            this.appState.periods.forEach(period => {
                const slot = this.appState.timetable[day]?.[period.id]?.[classId];
                
                if (slot?.is_break) {
                    timetable[day][period.name] = period.type === 'break' ? 'Break' : 'Lunch';
                } else if (slot?.subject_id) {
                    const subject = this.appState.subjects.find(s => s.id === slot.subject_id);
                    const teacher = this.appState.teachers.find(t => t.id === slot.teacher_id);
                    timetable[day][period.name] = `${subject?.name || 'Unknown'} - ${teacher?.name || 'Unknown'}`;
                } else {
                    timetable[day][period.name] = 'Free';
                }
            });
        });

        return timetable;
    }

    async prepareStreamTimetables(selectedStreams = []) {
        // Similar to class timetables but grouped by stream
        return await this.prepareClassTimetables(selectedStreams);
    }

    async exportToExcel(data, filename) {
        // Using SheetJS (xlsx) library - would need to be included
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const wb = XLSX.utils.book_new();

        Object.keys(data).forEach(sheetName => {
            const timetable = data[sheetName];
            const wsData = this.convertTimetableToSheet(timetable);
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Sheet names max 31 chars
        });

        XLSX.writeFile(wb, `${filename}.xlsx`);
        
        // Log export
        await this.logExport('excel', filename);
        
        return true;
    }

    async exportToWord(data, filename) {
        // Using html-to-docx or similar approach
        // This is a simplified implementation
        const content = this.generateWordContent(data);
        const blob = new Blob([content], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.doc`;
        link.click();
        
        URL.revokeObjectURL(url);
        
        // Log export
        await this.logExport('word', filename);
        
        return true;
    }

    async exportToPDF(data, filename) {
        // Using jsPDF or similar library
        // This is a placeholder implementation
        console.log('PDF export would be implemented here');
        
        // Log export
        await this.logExport('pdf', filename);
        
        return true;
    }

    convertTimetableToSheet(timetable) {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const periods = this.appState.periods.map(p => p.name);
        
        // Create header row
        const sheetData = [['Period', ...days]];
        
        // Add data rows
        periods.forEach(period => {
            const row = [period];
            days.forEach(day => {
                row.push(timetable[day]?.[period] || '');
            });
            sheetData.push(row);
        });
        
        return sheetData;
    }

    generateWordContent(data) {
        let content = '';
        
        Object.keys(data).forEach(name => {
            content += `<h1>${name} Timetable</h1>`;
            content += this.timetableToHTMLTable(data[name]);
            content += '<br><br>';
        });
        
        return content;
    }

    timetableToHTMLTable(timetable) {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const periods = this.appState.periods.map(p => p.name);
        
        let html = '<table border="1" style="border-collapse: collapse; width: 100%;">';
        
        // Header row
        html += '<tr><th>Period</th>';
        days.forEach(day => html += `<th>${day}</th>`);
        html += '</tr>';
        
        // Data rows
        periods.forEach(period => {
            html += `<tr><td>${period}</td>`;
            days.forEach(day => {
                html += `<td>${timetable[day]?.[period] || ''}</td>`;
            });
            html += '</tr>';
        });
        
        html += '</table>';
        return html;
    }

    async logExport(format, filename) {
        const exportRecord = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            format: format,
            filename: filename,
            type: 'timetable_export'
        };

        try {
            await DataManager.saveExportHistory(exportRecord);
        } catch (error) {
            console.error('Failed to log export:', error);
        }
    }

    // Search functionality
    searchTimetable(query, type) {
        const results = [];
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const searchTerm = query.toLowerCase();

        switch (type) {
            case 'teacher':
                const teacher = this.appState.teachers.find(t => 
                    t.name.toLowerCase().includes(searchTerm)
                );
                if (teacher) {
                    days.forEach(day => {
                        this.appState.periods.forEach(period => {
                            for (const classId in this.appState.timetable[day]?.[period.id] || {}) {
                                const slot = this.appState.timetable[day][period.id][classId];
                                if (slot.teacher_id === teacher.id) {
                                    const cls = this.appState.classes.find(c => c.id === classId);
                                    const subject = this.appState.subjects.find(s => s.id === slot.subject_id);
                                    results.push({
                                        day,
                                        period: period.name,
                                        class: `${cls?.level} ${cls?.stream}`,
                                        subject: subject?.name,
                                        teacher: teacher.name
                                    });
                                }
                            }
                        });
                    });
                }
                break;

            case 'class':
                const classMatch = this.appState.classes.find(c => 
                    `${c.level} ${c.stream}`.toLowerCase().includes(searchTerm)
                );
                if (classMatch) {
                    days.forEach(day => {
                        this.appState.periods.forEach(period => {
                            const slot = this.appState.timetable[day]?.[period.id]?.[classMatch.id];
                            if (slot && slot.subject_id) {
                                const teacher = this.appState.teachers.find(t => t.id === slot.teacher_id);
                                const subject = this.appState.subjects.find(s => s.id === slot.subject_id);
                                results.push({
                                    day,
                                    period: period.name,
                                    class: `${classMatch.level} ${classMatch.stream}`,
                                    subject: subject?.name,
                                    teacher: teacher?.name
                                });
                            }
                        });
                    });
                }
                break;

            case 'subject':
                const subjectMatch = this.appState.subjects.find(s => 
                    s.name.toLowerCase().includes(searchTerm)
                );
                if (subjectMatch) {
                    days.forEach(day => {
                        this.appState.periods.forEach(period => {
                            for (const classId in this.appState.timetable[day]?.[period.id] || {}) {
                                const slot = this.appState.timetable[day][period.id][classId];
                                if (slot.subject_id === subjectMatch.id) {
                                    const cls = this.appState.classes.find(c => c.id === classId);
                                    const teacher = this.appState.teachers.find(t => t.id === slot.teacher_id);
                                    results.push({
                                        day,
                                        period: period.name,
                                        class: `${cls?.level} ${cls?.stream}`,
                                        subject: subjectMatch.name,
                                        teacher: teacher?.name
                                    });
                                }
                            }
                        });
                    });
                }
                break;
        }

        return results;
    }
}

export default ExportManager;