const fs = require('fs');
const { Pool } = require('pg');

async function run() {
    const pool = new Pool({
        connectionString: 'postgresql://postgres:root@localhost:5432/media_monitor'
    });
    
    try {
        const mig1 = fs.readFileSync('c:\\Users\\Sveltetech\\Desktop\\MediaMonitor\\internal_services\\media_monitor\\db\\migrations\\010_tweet_reply_cache_and_bookmarks.sql', 'utf8');
        await pool.query(mig1);
        console.log('Applied migration 010');
        
        const mig2 = fs.readFileSync('c:\\Users\\Sveltetech\\Desktop\\MediaMonitor\\internal_services\\media_monitor\\db\\migrations\\011_tweet_thread_analysis.sql', 'utf8');
        await pool.query(mig2);
        console.log('Applied migration 011');
        
        const mig3 = fs.readFileSync('c:\\Users\\Sveltetech\\Desktop\\MediaMonitor\\internal_services\\media_monitor\\db\\migrations\\012_decouple_thread_analysis.sql', 'utf8');
        await pool.query(mig3);
        console.log('Applied migration 012');
    } catch (e) {
        console.error('Migration error:', e);
    } finally {
        await pool.end();
    }
}

run();
