// supabaseClient.js - Centralized Database Connection

// 1. Your Supabase Credentials
const supabaseUrl = 'https://uqoevvlgoovzvmoscbic.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxb2V2dmxnb292enZtb3NjYmljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODE3MjAsImV4cCI6MjA5NTQ1NzcyMH0.MA2K0k23iLRwqfMVMZuz6jzgti85XnH7NnHHICkXkeE';

// 2. Initialize the connection globally
window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

console.log("Supabase connection initialized globally.");