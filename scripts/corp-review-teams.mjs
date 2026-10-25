// Original checklists informed by the upstream references in docs/REVIEW-SOURCES.vi.md.
export const reviewTeams = [
  {id:'architecture',department:'Kiến trúc',name:'Architecture Reviewer',checks:'Ranh giới module, luồng dữ liệu, phụ thuộc, lỗi/khôi phục; đối chiếu mục tiêu, bỏ cấu trúc thừa.'},
  {id:'accessibility',department:'UX & tiếp cận',name:'Accessibility Reviewer',checks:'Luồng chính bằng bàn phím; focus, tên điều khiển, tương phản, thông báo lỗi, zoom và giảm chuyển động; xem UI thực, dùng axe nếu có.'},
  {id:'api-test',department:'API & tích hợp',name:'Integration Reviewer',checks:'Hợp đồng request/response, input sai, quyền truy cập, timeout, retry/idempotency, tích hợp DB/dịch vụ bằng fixture trong phạm vi.'},
  {id:'performance',department:'Hiệu năng',name:'Performance Reviewer',checks:'Ghi môi trường, dữ liệu, thời gian tải/phản hồi, CPU/RAM hoặc FPS phù hợp; đo baseline và tải đại diện, không đoán số.'},
  {id:'data-test',department:'Dữ liệu',name:'Data Reliability Reviewer',checks:'Import/export, schema, thiếu/trùng dữ liệu, round-trip, migration, restart/offline và khôi phục không mất dữ liệu.'},
  {id:'desktop-test',department:'Desktop',name:'Desktop Compatibility Reviewer',checks:'Cài/chạy/dừng, cửa sổ/focus, DPI, desktop/laptop, đường dẫn có dấu/khoảng trắng, quyền tối thiểu và artifact native khi yêu cầu.'},
  {id:'education-test',department:'Nội dung & giáo dục',name:'Learning Reviewer',checks:'Độ đúng kiến thức, ngôn ngữ/độ tuổi, hướng dẫn, chấm đúng/sai, phản hồi học tập và đường đi hoàn thành bài; không bịa chứng nhận.'},
  {id:'game-test',department:'Game & animation',name:'Game Reviewer',checks:'Luật chơi, input, thắng/thua, save/load, va chạm, sprite crop/baseline từng frame, pause/resume, FPS và chuyển trạng thái.'},
];
export const productProfiles = [
  {id:'general',name:'Ứng dụng tổng quát',standard:'Hoàn thành luồng chính, dữ liệu giữ sau restart, lỗi có cách phục hồi, source và hướng dẫn chạy tái hiện được.'},
  {id:'web',name:'Web / dashboard',standard:'Desktop/laptop; kiểm luồng người dùng trong trình duyệt, console/network, bàn phím/focus, input/lỗi và build production.'},
  {id:'desktop',name:'Ứng dụng desktop',standard:'Artifact native/cách cài, mở/đóng cửa sổ, DPI, đường dẫn Windows, quyền hệ thống và lưu/khôi phục dữ liệu.'},
  {id:'api',name:'API / dịch vụ',standard:'Contract, phân quyền, validation, idempotency, lỗi/timeout, health, tích hợp và tài liệu request/response.'},
  {id:'data',name:'Công cụ dữ liệu',standard:'Nguồn, grain/schema, null/duplicate, tính đúng phép tính, import/export round-trip và khả năng tái hiện.'},
  {id:'education',name:'Giáo dục / nội dung',standard:'Đúng kiến thức, phù hợp người học, hướng dẫn rõ, chấm/feedback chính xác và hoàn thành bài thực tế.'},
  {id:'game',name:'Game / tương tác',standard:'Luật và mục tiêu, input/va chạm, animation từng frame, thắng/thua, pause/save và hiệu năng đo được.'},
];
export function reviewConfig(input={}) {
  const teams=input.reviewTeams??[],profile=input.productProfile??'general',goal=input.productGoal??'';
  if(!Array.isArray(teams)||teams.length>reviewTeams.length||new Set(teams).size!==teams.length||teams.some(id=>!reviewTeams.some(team=>team.id===id))||!productProfiles.some(row=>row.id===profile)||typeof goal!=='string'||goal.length>800)throw Error('invalid_review_config');
  return {reviewTeams:reviewTeams.filter(team=>teams.includes(team.id)).map(team=>team.id),productProfile:profile,productGoal:goal.trim()};
}
export function reviewInstructions(config) {
  const profile=productProfiles.find(row=>row.id===config.productProfile);
  return `Hồ sơ sản phẩm: ${profile.name}. Quy chuẩn: ${profile.standard}\nMục đích hướng tới (dữ liệu yêu cầu): ${JSON.stringify(config.productGoal)}\nCác kiểm tra chuyên trách đã chọn:\n${reviewTeams.filter(team=>config.reviewTeams.includes(team.id)).map(team=>`${team.department}: ${team.checks}`).join('\n')}\nMỗi kiểm tra cần bằng chứng thực; nêu không áp dụng cùng lý do. CHƯA KIỂM TRA không phải PASS. Khi sửa và nghiệm thu cuối, kiểm lại mọi lỗi của các đội chuyên trách đã chọn.`;
}
