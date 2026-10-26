// Structured project requirements. Empty optional fields get explicit, reversible defaults.
export const projectSpecDefaults=Object.freeze({
  audience:'Người dùng phổ thông; ưu tiên thao tác dễ hiểu.',
  platform:'Desktop/laptop Windows, trình duyệt hiện đại khi là ứng dụng web.',
  features:'Tự xác định các chức năng cốt lõi từ ý tưởng; hoàn thành luồng chính.',
  design:'Giao diện tiếng Việt gọn, rõ, dễ đọc; ít phụ đề và không tối ưu màn hình hẹp.',
  technology:'Ưu tiên stack hiện có, ít phụ thuộc; chọn stack phù hợp nếu dự án mới.',
  storage:'Dữ liệu local khi phù hợp; không thêm tài khoản/dịch vụ nếu chưa cần.',
  acceptance:'Kiểm tra chức năng, UI, input/lỗi, build/test/run thật; ghi rõ phần chưa kiểm chứng.',
  constraints:'Giữ dữ liệu có sẵn; không phát sinh chi phí hay public deploy khi chưa được yêu cầu.',
});
export const projectSpecLabels=Object.freeze({audience:'Người dùng',platform:'Nền tảng',features:'Chức năng',design:'Giao diện',technology:'Công nghệ',storage:'Dữ liệu',acceptance:'Nghiệm thu',constraints:'Ràng buộc'});
export function normalizeProjectSpec(input){
  if(input===undefined||input===null)input={};
  if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!Object.hasOwn(projectSpecDefaults,key)))throw Error('invalid_project_spec');
  return Object.fromEntries(Object.entries(projectSpecDefaults).map(([key,fallback])=>{
    const value=input[key];if(value!==undefined&&(typeof value!=='string'||value.length>1200))throw Error('invalid_project_spec');
    return [key,value?.trim()||fallback];
  }));
}
export function projectSpecPrompt(input){return '\nYêu cầu chi tiết đã chốt; giá trị mặc định là giả định có thể đảo ngược:\n<project_spec_data>\n'+JSON.stringify(normalizeProjectSpec(input))+'\n</project_spec_data>\n';}
