import React, { useState } from 'react';
import { TextField, Button, Typography, Box, Container, Snackbar, Alert } from '@mui/material';
import axios from 'axios';

const SignupForm: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [openSnackbar, setOpenSnackbar] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Validate inputs
    if (!email || !password) {
      setSnackbarMessage('Please fill in all fields');
      setSnackbarSeverity('error');
      setOpenSnackbar(true);
      return;
    }

    try {
      // Send POST request to the backend
      const response = await axios.post("http://54.206.14.84:4000/signup", {
        email: email,
        password: password,
      });

      // Check if signup was successful
      if (response.status === 200) {
        setSnackbarMessage('Signup Successful! Go to login and use the credentials to log in');
        setSnackbarSeverity('success');
        setOpenSnackbar(true);
      }
    } catch (error) {
      setSnackbarMessage('Signup Failed. Please try again.');
      setSnackbarSeverity('error');
      setOpenSnackbar(true);
    }
  };

  return (
    <Container
      maxWidth="xs"
      sx={{
        background: 'rgba(0, 0, 0, 0.8)', 
        borderRadius: '12px', 
        padding: '2rem', 
        marginTop: '5rem', 
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.5)',
      }}
    >
      <Box sx={{ textAlign: 'center', marginBottom: '1rem' }}>
        <Typography variant="h5" color="white">
          Sign Up
        </Typography>
      </Box>
      
      <form onSubmit={handleSubmit}>
        <Box sx={{ marginBottom: '1.5rem' }}>
          <TextField
            fullWidth
            label="Email"
            variant="outlined"
            color="primary"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{
              backgroundColor: '#333',
              borderRadius: '8px',
              '& .MuiInputBase-root': { color: '#fff' },
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: '#444' },
                '&:hover fieldset': { borderColor: '#666' },
              },
            }}
          />
        </Box>
        
        <Box sx={{ marginBottom: '1.5rem' }}>
          <TextField
            fullWidth
            label="Password"
            variant="outlined"
            type="password"
            color="primary"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{
              backgroundColor: '#333',
              borderRadius: '8px',
              '& .MuiInputBase-root': { color: '#fff' },
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: '#444' },
                '&:hover fieldset': { borderColor: '#666' },
              },
            }}
          />
        </Box>
        
        <Box sx={{ textAlign: 'center' }}>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{
              padding: '0.75rem 2rem',
              background: 'linear-gradient(45deg, #004D40, #00251A)',
              borderRadius: '8px',
              '&:hover': {
                background: 'linear-gradient(45deg, #003c33, #001d14)',
              },
            }}
          >
            Sign Up
          </Button>
        </Box>
      </form>

      <Snackbar
        open={openSnackbar}
        autoHideDuration={6000}
        onClose={() => setOpenSnackbar(false)}
      >
        <Alert
          onClose={() => setOpenSnackbar(false)}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default SignupForm;
