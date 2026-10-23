import bcrypt from 'bcryptjs';
const hash = '/j3lFfGa9U10TDQ/uwoVGxg4.NjF6t3ONHhAjmi9hALi6huS';
const candidates = [
  '12345678', 'password', 'Password123!', 'admin123', 'admin1234', 'admin', 'abdallah', 'abdallah123', 'furnierp', 'furnierp123',
  '0915727647', 'Password123', 'SuperAdmin123!', 'Pass1234'
];
for (const c of candidates) {
  if (bcrypt.compareSync(c, hash)) {
    console.log('MATCH FOUND:', c);
    process.exit(0);
  }
}
console.log('No simple match');
