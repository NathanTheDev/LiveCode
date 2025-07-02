const FullInput = ({ placeholder, textType, labelText, editFn }) => {
	return (
		<div className="pb-4">
			<label className="block text-sm font-medium text-gray-500">{labelText}</label>
			<input
				type={textType}
				className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none bg-[#282C34] text-white"
				placeholder={placeholder}
				onChange={(e) => {
					editFn(e.target.value);
				}}
			/>
		</div>
	);
};

export default FullInput;