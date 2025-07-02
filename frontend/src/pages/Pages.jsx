import { Routes, Route, Navigate } from "react-router";
import Login from "./Auth/Login.jsx";
import Register from "./Auth/Register.jsx";
import IDE from "./IDE.jsx";

const Pages = () => {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/ide" element={<IDE />} />
      <Route path="/*" element={<Login />} />
    </Routes>
  );
};

export default Pages;