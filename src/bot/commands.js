const { generateContent } = require("../services/geminiService");
const xlsx = require("xlsx");
const path = require("path");


const handleMessage = async (client, msg) => {
    if (!msg.content.includes(`<@${client.user.id}>`)) return;

    const query = msg.content.replace(`<@${client.user.id}>`, "").trim();

    try {
        if (query.toLowerCase().startsWith("search")) {
            const keyword = query.replace(/^search/i, "").trim();
            const filePath = path.join(__dirname, "../data/bankData.xlsx");
            return await handleExcelSearch(filePath, keyword, msg);
        }
        else{
            await generateContent(query, msg);
        }
    } catch (error) {
        console.error("An error occurred while processing the request", error);
        msg.reply("Tôi bị ngu không trả lời được");
    }
};

const searchExcelData = (filePath, keyword) => {
    const workbook = xlsx.readFile(filePath, { password: "08041990" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    return data.filter(row => {
        return Object.values(row).some(value =>
            value.toString().toLowerCase().includes(keyword.toLowerCase())
        );
    });
};

const handleExcelSearch = async (filePath, keyword, msg) => {
    try {
        const results = searchExcelData(filePath, keyword);
        if (results.length === 0) {
            msg.reply("Không tìm thấy dữ liệu phù hợp.");
        } else {
            const response = results
                .map(row => JSON.stringify(row, null, 2))
                .join("\n\n");
            msg.reply(`Kết quả tìm kiếm:\n\n${response}`);
        }
    } catch (error) {
        console.error("An error occurred while reading the Excel file", error);
        msg.reply("Đã xảy ra lỗi khi đọc file Excel.");
    }
};

module.exports = handleMessage;
