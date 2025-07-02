import { useState } from "react";
import FullInput from "../../components/FullInput";
import { Link, useNavigate } from "react-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

const Register = () => {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confPassword, setConfPassword] = useState('');
	const navigate = useNavigate();

	const register = async () => {
		if (password !== confPassword) {
			alert("Passwords must be equal");
			return;
		}
		if (password.length < 6) {
			alert("Password must be atleast 6 characters");
			return;
		}

		try {
    	const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    	const id = userCredential.user.auth.currentUser.uid;
			console.log(id);
			navigate(`/ide/${id}`);
  	} catch (error) {
    	console.error("Sign up error", error);
  	}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-[#282C34]">
			<div className="bg-[#21242B] rounded-2xl shadow-lg p-8 w-full max-w-md">
				<h2 className="text-2xl font-bold mb-6 text-center text-white">Register</h2>

				<FullInput placeholder={"Enter your email"} textType={"email"} labelText={"Email"} editFn={setEmail} />
				<FullInput placeholder={"Enter your password"} textType={"password"} labelText={"Password"} editFn={setPassword} />
				<FullInput placeholder={"Confirm your password"} textType={"password"} labelText={"Confirm Password"}  editFn={setConfPassword} />
				
				<button
					className="w-full bg-[#282C34] text-white py-2 rounded-md hover:bg-[#2B313D] transition cursor-pointer"
					onClick={register}
				>
					Register
				</button>
			
				<p className="text-gray-400 pt-4">
					Already have an account? &nbsp;
					<Link to={"/login"} className="underline">Login here!</Link>
				</p>

			</div>
		</div>

	);
};

export default Register;