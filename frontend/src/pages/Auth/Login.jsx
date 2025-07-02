import { useState } from "react";
import FullInput from "../../components/FullInput";
import { useNavigate } from "react-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";
import { Link } from "react-router";

const Login = () => {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const navigate = useNavigate();

	const login = async () => {
		try {
			const userCredential = await signInWithEmailAndPassword(auth, email, password);
    	const id = userCredential.user.auth.currentUser.uid;
			console.log(id);
			navigate(`/ide/${id}`);
  	} catch (error) {
    	alert("Sign up error", error);
  	}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-[#282C34]">
			<div className="bg-[#21242B] rounded-2xl shadow-lg p-8 w-full max-w-md">
				<h2 className="text-2xl font-bold mb-6 text-center text-white">Login</h2>

				<FullInput placeholder={"Enter your email"} textType={"email"} labelText={"Email"} editFn={setEmail} />
				<FullInput placeholder={"Enter your password"} textType={"password"} labelText={"Password"} editFn={setPassword} />
				
				<button
					className="w-full bg-[#282C34] text-white py-2 rounded-md hover:bg-[#2B313D] transition cursor-pointer"
					onClick={login}
				>
					Login
				</button>
				
				<p className="text-gray-400 pt-4">
					Don't have an account? &nbsp;
					<Link to={"/register"} className="underline">Register here!</Link>
				</p>
			</div>
		</div>
	);
};

export default Login;