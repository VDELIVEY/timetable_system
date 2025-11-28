import { DataManager } from './supabase-client.js';

class ExportManager {
    constructor(appState) {
        this.appState = appState;
        this.days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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

        this.days.forEach(day => {
            timetable[day] = {};
            this.appState.periods.forEach(period => {
                let lessonInfo = 'Free';
                
                // Find where this teacher is teaching in this period
                for (const classId in this.appState.timetable[day]?.[period.id] || {}) {
                    const slot = this.appState.timetable[day][period.id][classId];
                    if (slot.teacher_id === teacherId && !slot.is_break) {
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

        this.days.forEach(day => {
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
        // For now, treat streams same as classes
        return await this.prepareClassTimetables(selectedStreams);
    }

    async exportToExcel(data, filename) {
        // Check if SheetJS is available
        if (typeof XLSX === 'undefined') {
            // Fallback to CSV export
            return await this.exportToCSV(data, filename);
        }

        try {
            const wb = XLSX.utils.book_new();

            Object.keys(data).forEach(sheetName => {
                const timetable = data[sheetName];
                const wsData = this.convertTimetableToSheet(timetable);
                const ws = XLSX.utils.aoa_to_sheet(wsData);
                XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
            });

            XLSX.writeFile(wb, `${filename}.xlsx`);
            
            await this.logExport('excel', filename);
            
            return true;
        } catch (error) {
            console.error('Excel export failed, falling back to CSV:', error);
            return await this.exportToCSV(data, filename);
        }
    }

    async exportToCSV(data, filename) {
        let csvContent = '';
        
        Object.keys(data).forEach(sheetName => {
            csvContent += `${sheetName} Timetable\n\n`;
            const timetable = data[sheetName];
            const sheetData = this.convertTimetableToSheet(timetable);
            
            sheetData.forEach(row => {
                csvContent += row.join(',') + '\n';
            });
            
            csvContent += '\n\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.csv`;
        link.click();
        
        URL.revokeObjectURL(url);
        
        await this.logExport('csv', filename);
        return true;
    }

    async exportToWord(data, filename) {
        // Simple HTML-based Word export
        const content = this.generateWordContent(data);
        const blob = new Blob([`
            <html xmlns:o='urn:schemas-microsoft-com:office:office' 
                  xmlns:w='urn:schemas-microsoft-com:office:word' 
                  xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="utf-8">
                <title>Timetable Export</title>
            </head>
            <body>
                ${content}
            </body>
            </html>
        `], { type: 'application/msword' });
        
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.doc`;
        link.click();
        
        URL.revokeObjectURL(url);
        
        await this.logExport('word', filename);
        return true;
    }

    async exportToPDF(data, filename) {
        // Simple HTML-based PDF-like export
        const content = this.generateWordContent(data);
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>${filename}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    h1 { color: #333; }
                </style>
            </head>
            <body>
                ${content}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
        
        await this.logExport('pdf', filename);
        return true;
    }

    convertTimetableToSheet(timetable) {
        const periods = this.appState.periods.map(p => p.name);
        
        // Create header row
        const sheetData = [['Period', ...this.days]];
        
        // Add data rows
        periods.forEach(period => {
            const row = [period];
            this.days.forEach(day => {
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
        const periods = this.appState.periods.map(p => p.name);
        
        let html = '<table border="1" style="border-collapse: collapse; width: 100%;">';
        
        // Header row
        html += '<tr><th>Period</th>';
        this.days.forEach(day => html += `<th>${day}</th>`);
        html += '</tr>';
        
        // Data rows
        periods.forEach(period => {
            html += `<tr><td>${period}</td>`;
            this.days.forEach(day => {
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
        const searchTerm = query.toLowerCase();

        switch (type) {
            case 'teacher':
                const teacher = this.appState.teachers.find(t => 
                    t.name.toLowerCase().includes(searchTerm)
                );
                if (teacher) {
                    this.days.forEach(day => {
                        this.appState.periods.forEach(period => {
                            for (const classId in this.appState.timetable[day]?.[period.id] || {}) {
                                const slot = this.appState.timetable[day][period.id][classId];
                                if (slot.teacher_id === teacher.id && !slot.is_break) {
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
                    this.days.forEach(day => {
                        this.appState.periods.forEach(period => {
                            const slot = this.appState.timetable[day]?.[period.id]?.[classMatch.id];
                            if (slot && slot.subject_id && !slot.is_break) {
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
                    this.days.forEach(day => {
                        this.appState.periods.forEach(period => {
                            for (const classId in this.appState.timetable[day]?.[period.id] || {}) {
                                const slot = this.appState.timetable[day][period.id][classId];
                                if (slot.subject_id === subjectMatch.id && !slot.is_break) {
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