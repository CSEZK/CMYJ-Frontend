export async function buildCharacterSelectionPackage(profileIds, buildPackage, metadata = {}) {
  if (typeof buildPackage !== 'function') throw new Error('当前环境缺少角色打包接口。');

  const ids = [
    ...new Set(
      (Array.isArray(profileIds) ? profileIds : [])
        .map(id => String(id || '').trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) throw new Error('请至少选择一个角色档案。');

  const packages = [];
  for (const id of ids) {
    let packageBundle;
    try {
      packageBundle = await buildPackage(id, metadata);
    } catch (error) {
      throw new Error(`角色「${id}」打包失败：${error?.message || error}`);
    }
    if (!Array.isArray(packageBundle?.resources) || !packageBundle.resources.length) {
      throw new Error(`角色「${id}」打包结果无效。`);
    }
    packages.push(packageBundle);
  }

  return {
    ...packages[0],
    resources: packages.flatMap(packageBundle => packageBundle.resources),
  };
}
