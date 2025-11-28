// Error handling and notification system
class ErrorHandler {
    static init() {
        window.addEventListener('error', this.handleGlobalError.bind(this));
        window.addEventListener('unhandledrejection', this.handlePromiseRejection.bind(this));
        
        this.initNotificationContainer();
    }

    static handleGlobalError(event) {
        console.error('Global error:', event.error);
        this.showNotification('An unexpected error occurred. Please try again.', 'error');
        return false;
    }

    static handlePromiseRejection(event) {
        console.error('Unhandled promise rejection:', event.reason);
        this.showNotification('Operation failed: ' + (event.reason?.message || 'Unknown error'), 'error');
        event.preventDefault();
    }

    static initNotificationContainer() {
        if (!document.getElementById('notification-container')) {
            const container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
    }

    static showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notification-container');
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        notification.innerHTML = `
            <div class="notification-icon">${icons[type] || icons.info}</div>
            <div class="notification-content">
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">&times;</button>
        `;
        
        notification.style.cssText = `
            display: flex;
            align-items: center;
            padding: 1rem;
            margin-bottom: 0.5rem;
            background: ${this.getNotificationColor(type)};
            border: 1px solid ${this.getNotificationBorderColor(type)};
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            animation: slideInRight 0.3s ease-out;
            max-width: 400px;
        `;

        container.appendChild(notification);
        
        notification.querySelector('.notification-close').onclick = () => this.removeNotification(notification);
        
        if (duration > 0) {
            setTimeout(() => this.removeNotification(notification), duration);
        }

        return notification;
    }

    static removeNotification(notification) {
        if (notification && notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    static getNotificationColor(type) {
        const colors = {
            success: '#d1edff',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#e2e3e5'
        };
        return colors[type] || colors.info;
    }

    static getNotificationBorderColor(type) {
        const colors = {
            success: '#b8daff',
            error: '#f5c6cb',
            warning: '#ffeaa7',
            info: '#d6d8db'
        };
        return colors[type] || colors.info;
    }

    static showLoading(message = 'Loading...') {
        return this.showNotification(message, 'info', 0);
    }

    static hideLoading(notification) {
        if (notification) {
            this.removeNotification(notification);
        }
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .notification-icon {
        font-weight: bold;
        margin-right: 0.5rem;
        font-size: 1.2em;
    }
    
    .notification-content {
        flex: 1;
    }
    
    .notification-message {
        font-size: 0.9rem;
        line-height: 1.4;
    }
    
    .notification-close {
        background: none;
        border: none;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0;
        margin-left: 0.5rem;
        opacity: 0.7;
    }
    
    .notification-close:hover {
        opacity: 1;
    }
`;
document.head.appendChild(style);

export default ErrorHandler;