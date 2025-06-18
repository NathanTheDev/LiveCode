import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router';
import './Login.css'

const Login = () => {
	const navigate = useNavigate();

  return (
	<div className='login-container'>
		<h1>Please Login to Access the IDE</h1>
		<GoogleLogin
			onSuccess={credentialResponse => {
				const decoded = jwtDecode(credentialResponse.credential);
				console.log("Succeeded");
				navigate('/IDE');
			}}
			onError={() => {
				console.error("Login Failed");
			}}
		/>
	</div>
  );
}

export default Login;