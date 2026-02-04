// Simple database initialization script
const path = require('path');
const fs = require('fs');

console.log('🔄 Initializing SQLite database for credit layer...');

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Created data directory:', dataDir);
} else {
  console.log('✅ Data directory exists:', dataDir);
}

const dbPath = process.env.CREDIT_DB_PATH || path.join(dataDir, 'credit.db');
console.log('📍 Database will be located at:', dbPath);

if (fs.existsSync(dbPath)) {
  console.log('✅ Database file already exists');
  const stats = fs.statSync(dbPath);
  console.log('📊 Database size:', Math.round(stats.size / 1024), 'KB');
} else {
  console.log('ℹ️  Database file will be created automatically on first use');
}

console.log('✅ Database initialization setup complete!');
console.log('💡 The database tables will be created automatically when services are first accessed.');